//! Fixed-window request budgets for the routes that guess passwords or create accounts.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv6Addr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::http::HeaderMap;

use crate::error::AppError;

#[derive(Clone, Copy)]
pub struct Budget {
    pub name: &'static str,
    pub limit: u32,
    pub window: Duration,
}

const FIFTEEN_MINUTES: Duration = Duration::from_secs(15 * 60);
const ONE_HOUR: Duration = Duration::from_secs(60 * 60);
const SWEEP_EVERY: Duration = Duration::from_secs(10 * 60);
const MAX_KEYS: usize = 100_000;

pub const SIGN_IN_IP: Budget = Budget {
    name: "sign-in-ip",
    limit: 20,
    window: FIFTEEN_MINUTES,
};
pub const SIGN_IN_EMAIL_IP: Budget = Budget {
    name: "sign-in-email-ip",
    limit: 10,
    window: FIFTEEN_MINUTES,
};
pub const SIGN_IN_EMAIL: Budget = Budget {
    name: "sign-in-email",
    limit: 50,
    window: FIFTEEN_MINUTES,
};
pub const SIGN_UP_IP: Budget = Budget {
    name: "sign-up-ip",
    limit: 10,
    window: ONE_HOUR,
};
pub const PASSWORD_CHANGE_USER: Budget = Budget {
    name: "password-change-user",
    limit: 10,
    window: FIFTEEN_MINUTES,
};
pub const PASSWORD_RESET_IP: Budget = Budget {
    name: "password-reset-ip",
    limit: 10,
    window: ONE_HOUR,
};
pub const PASSWORD_RESET_EMAIL: Budget = Budget {
    name: "password-reset-email",
    limit: 3,
    window: ONE_HOUR,
};
pub const PASSWORD_RESET_CONFIRM_IP: Budget = Budget {
    name: "password-reset-confirm-ip",
    limit: 20,
    window: ONE_HOUR,
};
pub const EMAIL_VERIFY_USER: Budget = Budget {
    name: "email-verify-user",
    limit: 3,
    window: ONE_HOUR,
};
pub const EMAIL_VERIFY_CONFIRM_IP: Budget = Budget {
    name: "email-verify-confirm-ip",
    limit: 20,
    window: ONE_HOUR,
};

struct Window {
    ends: Instant,
    count: u32,
}

#[derive(Default)]
struct State {
    windows: HashMap<String, Window>,
    last_sweep: Option<Instant>,
}

// ponytail: in-process map, right for one Railway instance; a second instance needs a shared store (Postgres or Redis).
#[derive(Default)]
pub struct Limiter {
    state: Mutex<State>,
}

impl Limiter {
    /// Spends one unit of `key`; `Err` carries the seconds until its window ends.
    pub fn hit(&self, key: &str, budget: Budget, now: Instant) -> Result<(), u64> {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let last_sweep = *state.last_sweep.get_or_insert(now);
        let full = state.windows.len() >= MAX_KEYS && !state.windows.contains_key(key);
        if full || now.duration_since(last_sweep) >= SWEEP_EVERY {
            state.windows.retain(|_, window| window.ends > now);
            state.last_sweep = Some(now);
        }
        // ponytail: fails closed at MAX_KEYS live keys (~10 MB) and sweeps O(n) per new key while
        // full; a shared store with TTLs (Redis) lifts both.
        if full && state.windows.len() >= MAX_KEYS {
            return Err(budget.window.as_secs().max(1));
        }
        let window = state.windows.entry(key.to_string()).or_insert(Window {
            ends: now,
            count: 0,
        });
        if window.ends <= now {
            *window = Window {
                ends: now + budget.window,
                count: 0,
            };
        }
        window.count = window.count.saturating_add(1);
        if window.count <= budget.limit {
            return Ok(());
        }
        let remaining = window.ends.duration_since(now).as_millis().div_ceil(1000);
        Err(u64::try_from(remaining).unwrap_or(u64::MAX).max(1))
    }

    /// Spends one unit of each known key in order; the first key over its budget refuses and
    /// later keys are left untouched.
    pub fn check(&self, keys: &[(Budget, Option<String>)]) -> Result<(), AppError> {
        let now = Instant::now();
        for (budget, value) in keys {
            let Some(value) = value else { continue };
            self.hit(&format!("{}:{value}", budget.name), *budget, now)
                .map_err(|retry_after| AppError::TooManyRequests { retry_after })?;
        }
        Ok(())
    }
}

/// The last `X-Forwarded-For` address, else the socket peer; IPv4-mapped addresses become IPv4
/// and IPv6 is cut to its /64. Railway's edge appends the address it saw, so earlier entries come
/// from the client and can be forged. A loopback client (local runs and e2e, never behind Railway)
/// gets no IP key.
pub fn client_ip(headers: &HeaderMap, peer: Option<SocketAddr>) -> Option<IpAddr> {
    let ip = headers
        .get_all("x-forwarded-for")
        .iter()
        .next_back()
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.rsplit(',').next())
        .and_then(|last| last.trim().parse().ok())
        .or(peer.map(|peer| peer.ip()))?
        .to_canonical();
    if ip.is_loopback() {
        return None;
    }
    Some(match ip {
        IpAddr::V6(v6) => IpAddr::V6(Ipv6Addr::from(u128::from(v6) & !u128::from(u64::MAX))),
        v4 => v4,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_loopback_client_has_no_ip_key() {
        let peer: SocketAddr = "127.0.0.1:4000".parse().unwrap();
        assert_eq!(client_ip(&HeaderMap::new(), Some(peer)), None);
        let v6: SocketAddr = "[::1]:4000".parse().unwrap();
        assert_eq!(client_ip(&HeaderMap::new(), Some(v6)), None);
    }

    const BUDGET: Budget = Budget {
        name: "test",
        limit: 3,
        window: Duration::from_secs(900),
    };

    #[test]
    fn a_key_spends_its_budget_then_waits_for_the_window_end() {
        let limiter = Limiter::default();
        let start = Instant::now();
        for _ in 0..3 {
            assert_eq!(limiter.hit("ana", BUDGET, start), Ok(()));
        }

        assert_eq!(limiter.hit("ana", BUDGET, start), Err(900));
        let later = start + Duration::from_millis(600_500);
        assert_eq!(limiter.hit("ana", BUDGET, later), Err(300));
        assert_eq!(limiter.hit("bia", BUDGET, later), Ok(()));
        let window_end = start + Duration::from_secs(900);
        assert_eq!(limiter.hit("ana", BUDGET, window_end), Ok(()));
    }

    #[test]
    fn expired_windows_are_swept_every_ten_minutes() {
        let short = Budget {
            name: "short",
            limit: 3,
            window: Duration::from_secs(60),
        };
        let limiter = Limiter::default();
        let start = Instant::now();
        limiter.hit("ana", short, start).unwrap();

        limiter
            .hit("bia", short, start + Duration::from_secs(500))
            .unwrap();
        assert!(limiter.state.lock().unwrap().windows.contains_key("ana"));

        limiter
            .hit("caio", short, start + Duration::from_secs(600))
            .unwrap();
        let state = limiter.state.lock().unwrap();
        let mut keys: Vec<_> = state.windows.keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, ["caio"]);
    }

    #[test]
    fn retry_after_is_never_zero() {
        let instant = Budget {
            name: "instant",
            limit: 0,
            window: Duration::ZERO,
        };
        let limiter = Limiter::default();
        assert_eq!(limiter.hit("ana", instant, Instant::now()), Err(1));
    }

    #[test]
    fn a_full_map_refuses_new_keys_but_still_counts_known_ones() {
        let limiter = Limiter::default();
        let start = Instant::now();
        for index in 0..MAX_KEYS {
            limiter.hit(&index.to_string(), BUDGET, start).unwrap();
        }

        assert_eq!(limiter.hit("new", BUDGET, start), Err(900));
        assert_eq!(limiter.hit("0", BUDGET, start), Ok(()));
        assert_eq!(limiter.hit("0", BUDGET, start), Ok(()));
        assert_eq!(limiter.hit("0", BUDGET, start), Err(900));
        assert_eq!(limiter.state.lock().unwrap().windows.len(), MAX_KEYS);
    }

    #[test]
    fn a_full_map_sweeps_expired_keys_to_make_room() {
        let limiter = Limiter::default();
        let start = Instant::now();
        for index in 0..MAX_KEYS {
            limiter.hit(&index.to_string(), BUDGET, start).unwrap();
        }

        let expired = start + Duration::from_secs(900);
        assert_eq!(limiter.hit("new", BUDGET, expired), Ok(()));
        assert_eq!(limiter.state.lock().unwrap().windows.len(), 1);
    }

    #[test]
    fn a_refused_key_stops_the_check_before_later_keys() {
        let limiter = Limiter::default();
        let ip = || Some("203.0.113.1".to_string());
        for _ in 0..3 {
            limiter.check(&[(BUDGET, ip())]).unwrap();
        }

        let refused = limiter.check(&[(BUDGET, ip()), (SIGN_IN_EMAIL, Some("ana".into()))]);
        assert!(matches!(
            refused,
            Err(AppError::TooManyRequests { retry_after: 900 })
        ));
        assert_eq!(limiter.state.lock().unwrap().windows.len(), 1);
    }

    fn forwarded(lines: &[&str]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for line in lines {
            headers.append("x-forwarded-for", line.parse().unwrap());
        }
        headers
    }

    #[test]
    fn the_client_is_the_last_forwarded_address_else_the_peer() {
        let peer: SocketAddr = "10.0.0.9:4000".parse().unwrap();
        let ip = |value: &str| -> IpAddr { value.parse().unwrap() };

        let spoofed = client_ip(&forwarded(&["1.2.3.4, 203.0.113.7 "]), Some(peer));
        assert_eq!(spoofed, Some(ip("203.0.113.7")));
        let lines = forwarded(&["203.0.113.9", "1.2.3.4, 203.0.113.8"]);
        assert_eq!(client_ip(&lines, None), Some(ip("203.0.113.8")));
        let malformed = client_ip(&forwarded(&["not-an-ip"]), Some(peer));
        assert_eq!(malformed, Some(peer.ip()));
        assert_eq!(client_ip(&HeaderMap::new(), Some(peer)), Some(peer.ip()));
        assert_eq!(client_ip(&forwarded(&["not-an-ip"]), None), None);
    }

    #[test]
    fn ipv4_mapped_addresses_are_plain_ipv4() {
        let mapped = client_ip(&forwarded(&["::ffff:1.2.3.4"]), None);
        assert_eq!(mapped, client_ip(&forwarded(&["1.2.3.4"]), None));
        let peer: SocketAddr = "[::ffff:1.2.3.4]:4000".parse().unwrap();
        assert_eq!(client_ip(&HeaderMap::new(), Some(peer)), mapped);
    }

    #[test]
    fn ipv6_clients_are_keyed_by_their_slash_64() {
        let key = |value: &str| client_ip(&forwarded(&[value]), None);
        assert_eq!(
            key("2001:db8:1:2::1"),
            key("2001:db8:1:2:ffff:ffff:ffff:ffff")
        );
        assert_eq!(
            key("2001:db8:1:2::1"),
            Some("2001:db8:1:2::".parse().unwrap())
        );
        assert_ne!(key("2001:db8:1:2::1"), key("2001:db8:1:3::1"));
    }
}
