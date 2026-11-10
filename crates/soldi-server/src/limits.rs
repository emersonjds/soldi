//! Fixed-window request budgets for the routes that guess passwords or create accounts.

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
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

pub const SIGN_IN_IP: Budget = Budget {
    name: "sign-in-ip",
    limit: 20,
    window: FIFTEEN_MINUTES,
};
pub const SIGN_IN_EMAIL: Budget = Budget {
    name: "sign-in-email",
    limit: 10,
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
        if now.duration_since(last_sweep) >= SWEEP_EVERY {
            state.windows.retain(|_, window| window.ends > now);
            state.last_sweep = Some(now);
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
        Err(u64::try_from(remaining).unwrap_or(u64::MAX))
    }

    /// Spends one unit of every known key; refused when any key is over its budget.
    pub fn check(&self, keys: &[(Budget, Option<String>)]) -> Result<(), AppError> {
        let now = Instant::now();
        let retry_after = keys
            .iter()
            .filter_map(|(budget, value)| {
                let key = format!("{}:{}", budget.name, value.as_ref()?);
                self.hit(&key, *budget, now).err()
            })
            .max();
        match retry_after {
            Some(retry_after) => Err(AppError::TooManyRequests { retry_after }),
            None => Ok(()),
        }
    }
}

/// The first `X-Forwarded-For` address (set by Railway's edge), else the socket peer.
pub fn client_ip(headers: &HeaderMap, peer: Option<SocketAddr>) -> Option<IpAddr> {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .and_then(|first| first.trim().parse().ok())
        .or(peer.map(|peer| peer.ip()))
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let limiter = Limiter::default();
        let start = Instant::now();
        limiter.hit("ana", BUDGET, start).unwrap();
        limiter
            .hit("bia", BUDGET, start + Duration::from_secs(300))
            .unwrap();

        limiter
            .hit("caio", BUDGET, start + Duration::from_secs(1000))
            .unwrap();

        let state = limiter.state.lock().unwrap();
        let mut keys: Vec<_> = state.windows.keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, ["bia", "caio"]);
    }

    #[test]
    fn the_client_is_the_first_forwarded_address_else_the_peer() {
        let peer: SocketAddr = "10.0.0.9:4000".parse().unwrap();
        let headers = |value: &str| {
            let mut headers = HeaderMap::new();
            headers.insert("x-forwarded-for", value.parse().unwrap());
            headers
        };

        let first = client_ip(&headers(" 203.0.113.7 , 10.0.0.1"), Some(peer));
        assert_eq!(first, Some("203.0.113.7".parse().unwrap()));
        let v6 = client_ip(&headers("2001:db8::1"), None);
        assert_eq!(v6, Some("2001:db8::1".parse().unwrap()));
        let malformed = client_ip(&headers("not-an-ip"), Some(peer));
        assert_eq!(malformed, Some(peer.ip()));
        assert_eq!(client_ip(&HeaderMap::new(), Some(peer)), Some(peer.ip()));
        assert_eq!(client_ip(&headers("not-an-ip"), None), None);
    }
}
