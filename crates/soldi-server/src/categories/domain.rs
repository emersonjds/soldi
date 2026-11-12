use chrono::NaiveDate;
use rust_decimal::Decimal;
use soldi_types::categories::{Category, CategoryKind};
use uuid::Uuid;

use crate::error::{AppError, reject_nul};
use crate::settings::domain::check_money;

/// The market analysis list (docs/specs/market-analysis.md): name, kind, lucide icon.
const DEFAULTS: [(&str, CategoryKind, &str); 30] = {
    use CategoryKind::{Bill, Daily, Income};
    [
        ("Salário", Income, "briefcase"),
        ("Extra", Income, "sparkles"),
        ("Reembolso", Income, "undo-2"),
        ("Aluguel", Bill, "home"),
        ("Condomínio", Bill, "building-2"),
        ("Luz", Bill, "zap"),
        ("Água", Bill, "droplets"),
        ("Internet", Bill, "wifi"),
        ("Celular", Bill, "smartphone"),
        ("Cartão", Bill, "credit-card"),
        ("Assinaturas", Bill, "repeat"),
        ("Escola", Bill, "graduation-cap"),
        ("Seguro", Bill, "shield"),
        ("Financiamento", Bill, "landmark"),
        ("Impostos", Bill, "receipt"),
        ("Mercado", Daily, "shopping-cart"),
        ("Comida fora", Daily, "utensils"),
        ("Transporte", Daily, "car"),
        ("Combustível", Daily, "fuel"),
        ("Saúde", Daily, "heart-pulse"),
        ("Farmácia", Daily, "pill"),
        ("Lazer", Daily, "gamepad-2"),
        ("Roupas", Daily, "shirt"),
        ("Casa", Daily, "sofa"),
        ("Pets", Daily, "paw-print"),
        ("Presentes", Daily, "gift"),
        ("Beleza", Daily, "scissors"),
        ("Educação", Daily, "book-open"),
        ("Viagem", Daily, "plane"),
        ("Outros", Daily, "circle-dashed"),
    ]
};

/// The savings categories (SOL-20), seeded after the defaults.
const SAVINGS: [(&str, CategoryKind); 2] = [
    ("Economia", CategoryKind::Bill),
    ("Resgate", CategoryKind::Income),
];

pub const DEFAULT_ICON: &str = "circle-dashed";

pub struct Seed {
    pub name: &'static str,
    pub kind: CategoryKind,
    pub icon: &'static str,
    pub color: String,
    pub is_savings: bool,
}

/// The owners of `cat-1..cat-12`, in order (docs/design/tokens.md).
const PALETTE: [&str; 12] = [
    "Mercado",
    "Comida fora",
    "Transporte",
    "Saúde",
    "Lazer",
    "Aluguel",
    "Luz",
    "Internet",
    "Cartão",
    "Assinaturas",
    "Salário",
    "Extra",
];

const TOKENS: u8 = 24;

/// The defaults then the savings ones: the palette's twelve take their own token, every other
/// takes the lowest token not yet used in its kind, in list order.
pub fn defaults() -> Vec<Seed> {
    let owned = |name: &str| {
        PALETTE
            .iter()
            .position(|&owner| owner == name)
            .map(|index| format!("cat-{}", index + 1))
    };
    let mut taken: Vec<(CategoryKind, String)> = DEFAULTS
        .iter()
        .filter_map(|&(name, kind, _)| Some((kind, owned(name)?)))
        .collect();
    DEFAULTS
        .iter()
        .map(|&(name, kind, icon)| (name, kind, icon, false))
        .chain(SAVINGS.map(|(name, kind)| (name, kind, "piggy-bank", true)))
        .map(|(name, kind, icon, is_savings)| {
            let color = owned(name).unwrap_or_else(|| {
                let colors: Vec<String> = taken
                    .iter()
                    .filter(|(each, _)| *each == kind)
                    .map(|(_, color)| color.clone())
                    .collect();
                let color = pick_color(None, &colors).expect("24 tokens cover the seeds");
                taken.push((kind, color.clone()));
                color
            });
            Seed {
                name,
                kind,
                icon,
                color,
                is_savings,
            }
        })
        .collect()
}

/// The color of a top-level category given the colors other active top-levels of its kind hold:
/// `requested` when free, the lowest free token when none is requested.
pub fn pick_color(requested: Option<&str>, taken: &[String]) -> Result<String, AppError> {
    let free = |color: &str| !taken.iter().any(|each| each == color);
    match requested {
        Some(color) if free(color) => Ok(color.to_string()),
        Some(_) => Err(color_taken()),
        None => (1..=TOKENS)
            .map(|n| format!("cat-{n}"))
            .find(|color| free(color))
            .ok_or_else(|| {
                AppError::rule(
                    "palette-full",
                    "All 24 colors are in use in this kind; archive one or make it a subcategory.",
                )
            }),
    }
}

pub fn color_taken() -> AppError {
    AppError::rule(
        "color-taken",
        "Another active category of this kind has this color.",
    )
}

pub fn check_name(name: &str) -> Result<String, AppError> {
    reject_nul("name", name)?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 50 {
        return Err(AppError::invalid("name", "must have 1 to 50 characters"));
    }
    Ok(name.to_string())
}

/// A lucide name: lowercase words of letters and digits joined by single hyphens.
pub fn check_icon(icon: &str) -> Result<(), AppError> {
    let valid = icon.len() <= 50
        && icon.split('-').all(|word| {
            !word.is_empty()
                && word
                    .chars()
                    .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
        });
    if !valid {
        return Err(AppError::invalid("icon", "must be a lucide icon name"));
    }
    Ok(())
}

pub fn check_color(color: &str) -> Result<(), AppError> {
    let number = color
        .strip_prefix("cat-")
        .and_then(|n| n.parse::<u8>().ok());
    let canonical =
        number.is_some_and(|n| (1..=TOKENS).contains(&n) && color == format!("cat-{n}"));
    if !canonical {
        return Err(AppError::invalid("color", "must be one of cat-1 to cat-24"));
    }
    Ok(())
}

/// `parent` may hold the category `id` (none when creating) of `kind`: a top-level category on the
/// same side (income or outflow, D26), `Economia` only for bills, not itself, and only when `id`
/// has no subcategories of its own.
pub fn check_parent(
    id: Option<Uuid>,
    kind: CategoryKind,
    has_children: bool,
    parent: &Category,
) -> Result<(), AppError> {
    if parent.is_savings && parent.kind == CategoryKind::Income {
        return Err(savings_category());
    }
    let same_side = (parent.kind == CategoryKind::Income) == (kind == CategoryKind::Income);
    let cofrinho_ok = !parent.is_savings || kind == CategoryKind::Bill;
    if !same_side || !cofrinho_ok {
        return Err(AppError::invalid(
            "parent_id",
            "must be on the same side (income or outflow), and only a Saída goes under Economia",
        ));
    }
    if id == Some(parent.id) {
        return Err(AppError::invalid("parent_id", "must be another category"));
    }
    if has_children || parent.parent_id.is_some() {
        return Err(AppError::rule(
            "nested-subcategory",
            "A subcategory cannot have subcategories.",
        ));
    }
    Ok(())
}

fn savings_category() -> AppError {
    AppError::rule(
        "savings-category",
        "Economia and Resgate are never archived and never subcategories.",
    )
}

/// `Economia` and `Resgate` stay top-level and active.
pub fn check_not_savings(category: &Category) -> Result<(), AppError> {
    match category.is_savings {
        true => Err(savings_category()),
        false => Ok(()),
    }
}

/// A cofrinho is a subcategory of `Economia`.
pub fn is_cofrinho_parent(parent: Option<&Category>) -> bool {
    parent.is_some_and(|parent| parent.is_savings && parent.kind == CategoryKind::Bill)
}

/// `target` and `deadline` are set only on a cofrinho; a target is money greater than zero.
pub fn check_goal(
    cofrinho: bool,
    target: Option<Decimal>,
    deadline: Option<NaiveDate>,
) -> Result<(), AppError> {
    if let Some(target) = target {
        if target <= Decimal::ZERO {
            return Err(AppError::invalid("target", "must be greater than zero"));
        }
        check_money("target", target)?;
    }
    if !cofrinho && (target.is_some() || deadline.is_some()) {
        return Err(AppError::rule(
            "not-a-cofrinho",
            "Only a subcategory of Economia has a target or a deadline.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn field(result: Result<impl std::fmt::Debug, AppError>) -> String {
        match result {
            Err(AppError::Validation(errors)) => errors[0].field.clone(),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn the_defaults_are_the_market_analysis_list() {
        let seeds = defaults();
        let count = |kind| seeds.iter().filter(|seed| seed.kind == kind).count();

        assert_eq!(seeds.len(), 32);
        assert_eq!(count(CategoryKind::Income), 4);
        assert_eq!(count(CategoryKind::Bill), 13);
        assert_eq!(count(CategoryKind::Daily), 15);
        assert_eq!(
            (seeds[0].name, seeds[0].icon, seeds[0].color.as_str()),
            ("Salário", "briefcase", "cat-11")
        );
        let outros = seeds.iter().find(|seed| seed.name == "Outros").unwrap();
        assert_eq!(
            (outros.icon, outros.kind),
            ("circle-dashed", CategoryKind::Daily)
        );
        for seed in &seeds {
            assert!(check_icon(seed.icon).is_ok(), "{}", seed.icon);
        }
        let savings: Vec<_> = seeds
            .iter()
            .filter(|seed| seed.is_savings)
            .map(|seed| (seed.name, seed.kind, seed.icon, seed.color.as_str()))
            .collect();
        assert_eq!(
            savings,
            [
                ("Economia", CategoryKind::Bill, "piggy-bank", "cat-13"),
                ("Resgate", CategoryKind::Income, "piggy-bank", "cat-2")
            ]
        );
    }

    #[test]
    fn only_a_cofrinho_has_a_positive_target_or_a_deadline() {
        let economia = Category {
            is_savings: true,
            ..category(1, CategoryKind::Bill, None)
        };
        let resgate = Category {
            is_savings: true,
            ..category(2, CategoryKind::Income, None)
        };
        let deadline = Some(NaiveDate::from_ymd_opt(2027, 6, 30).unwrap());

        assert!(is_cofrinho_parent(Some(&economia)));
        assert!(!is_cofrinho_parent(Some(&resgate)));
        assert!(!is_cofrinho_parent(None));
        assert!(check_goal(true, Some(Decimal::new(1000000, 2)), deadline).is_ok());
        assert!(check_goal(false, None, None).is_ok());
        assert_eq!(slug(check_goal(false, None, deadline)), "not-a-cofrinho");
        assert_eq!(
            slug(check_goal(false, Some(Decimal::ONE), None)),
            "not-a-cofrinho"
        );
        for target in [Decimal::ZERO, Decimal::NEGATIVE_ONE, Decimal::new(1001, 3)] {
            assert_eq!(field(check_goal(true, Some(target), None)), "target");
        }
        assert_eq!(slug(check_not_savings(&economia)), "savings-category");
        assert_eq!(
            slug(check_parent(None, CategoryKind::Income, false, &resgate)),
            "savings-category"
        );
        assert!(check_not_savings(&category(3, CategoryKind::Daily, None)).is_ok());
    }

    #[test]
    fn the_twelve_named_defaults_own_the_palette_and_the_rest_take_the_lowest_free_token() {
        let seeds = defaults();
        let color = |name: &str| {
            seeds
                .iter()
                .find(|seed| seed.name == name)
                .unwrap()
                .color
                .clone()
        };

        for (name, token) in [
            ("Mercado", "cat-1"),
            ("Comida fora", "cat-2"),
            ("Transporte", "cat-3"),
            ("Saúde", "cat-4"),
            ("Lazer", "cat-5"),
            ("Aluguel", "cat-6"),
            ("Luz", "cat-7"),
            ("Internet", "cat-8"),
            ("Cartão", "cat-9"),
            ("Assinaturas", "cat-10"),
            ("Salário", "cat-11"),
            ("Extra", "cat-12"),
            ("Reembolso", "cat-1"),
            ("Resgate", "cat-2"),
            ("Condomínio", "cat-1"),
            ("Celular", "cat-3"),
            ("Impostos", "cat-12"),
            ("Economia", "cat-13"),
            ("Combustível", "cat-6"),
            ("Casa", "cat-9"),
            ("Outros", "cat-15"),
        ] {
            assert_eq!(color(name), token, "{name}");
        }
        for kind in [
            CategoryKind::Income,
            CategoryKind::Bill,
            CategoryKind::Daily,
        ] {
            let mut colors: Vec<_> = seeds
                .iter()
                .filter(|seed| seed.kind == kind)
                .map(|seed| seed.color.as_str())
                .collect();
            let count = colors.len();
            colors.sort_unstable();
            colors.dedup();
            assert_eq!(colors.len(), count, "{kind:?}");
        }
    }

    #[test]
    fn a_top_level_color_is_free_in_its_kind() {
        let taken =
            |tokens: &[u8]| -> Vec<String> { tokens.iter().map(|n| format!("cat-{n}")).collect() };
        let full = taken(&(1..=24).collect::<Vec<_>>());
        let slug = |result: Result<String, AppError>| match result {
            Err(AppError::Rule { slug, .. }) => slug,
            other => panic!("{other:?}"),
        };

        assert_eq!(pick_color(None, &[]).unwrap(), "cat-1");
        assert_eq!(pick_color(None, &taken(&[1, 3])).unwrap(), "cat-2");
        assert_eq!(pick_color(None, &full[..23]).unwrap(), "cat-24");
        assert_eq!(pick_color(Some("cat-4"), &taken(&[1, 3])).unwrap(), "cat-4");
        assert_eq!(
            slug(pick_color(Some("cat-3"), &taken(&[1, 3]))),
            "color-taken"
        );
        assert_eq!(slug(pick_color(None, &full)), "palette-full");
        assert_eq!(slug(pick_color(Some("cat-9"), &full)), "color-taken");
    }

    #[test]
    fn names_are_trimmed_and_bounded() {
        assert_eq!(check_name(" Mercado  ").unwrap(), "Mercado");
        assert_eq!(field(check_name("   ")), "name");
        assert!(check_name(&"x".repeat(50)).is_ok());
        assert!(check_name(&"x".repeat(51)).is_err());
        assert!(check_name("a\0").is_err());
    }

    #[test]
    fn icons_are_lucide_style_names() {
        for icon in ["home", "heart-pulse", "gamepad-2", "undo-2"] {
            assert!(check_icon(icon).is_ok(), "{icon}");
        }
        for icon in ["", "Home", "a b", "-x", "x-", "x--y", "<svg>"] {
            assert_eq!(field(check_icon(icon)), "icon", "{icon}");
        }
        assert!(check_icon(&"a".repeat(51)).is_err());
    }

    fn category(id: u128, kind: CategoryKind, parent_id: Option<u128>) -> Category {
        Category {
            id: Uuid::from_u128(id),
            name: "Casa".into(),
            kind,
            icon: "sofa".into(),
            color: "cat-1".into(),
            parent_id: parent_id.map(Uuid::from_u128),
            is_savings: false,
            target: None,
            deadline: None,
        }
    }

    fn slug(result: Result<(), AppError>) -> &'static str {
        match result {
            Err(AppError::Rule { slug, .. }) => slug,
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_parent_is_another_top_level_category() {
        let casa = category(1, CategoryKind::Daily, None);

        assert!(check_parent(None, CategoryKind::Daily, false, &casa).is_ok());
        assert!(check_parent(Some(Uuid::from_u128(2)), CategoryKind::Daily, false, &casa).is_ok());
        assert_eq!(
            field(check_parent(
                Some(Uuid::from_u128(1)),
                CategoryKind::Daily,
                false,
                &casa
            )),
            "parent_id"
        );
    }

    #[test]
    fn a_group_holds_both_outflow_kinds_but_never_income_and_economia_only_bills() {
        let veiculo = category(1, CategoryKind::Bill, None);
        assert!(check_parent(None, CategoryKind::Daily, false, &veiculo).is_ok());
        assert!(check_parent(None, CategoryKind::Bill, false, &veiculo).is_ok());
        assert_eq!(
            field(check_parent(None, CategoryKind::Income, false, &veiculo)),
            "parent_id"
        );
        let salario = category(2, CategoryKind::Income, None);
        assert_eq!(
            field(check_parent(None, CategoryKind::Daily, false, &salario)),
            "parent_id"
        );
        let mut economia = category(3, CategoryKind::Bill, None);
        economia.is_savings = true;
        assert_eq!(
            field(check_parent(None, CategoryKind::Daily, false, &economia)),
            "parent_id"
        );
        assert!(check_parent(None, CategoryKind::Bill, false, &economia).is_ok());
    }

    #[test]
    fn subcategories_are_one_level_deep() {
        let luz = category(2, CategoryKind::Daily, Some(1));
        let casa = category(1, CategoryKind::Daily, None);

        assert_eq!(
            slug(check_parent(None, CategoryKind::Daily, false, &luz)),
            "nested-subcategory"
        );
        assert_eq!(
            slug(check_parent(
                Some(Uuid::from_u128(3)),
                CategoryKind::Daily,
                true,
                &casa
            )),
            "nested-subcategory"
        );
    }

    #[test]
    fn colors_are_the_twenty_four_tokens() {
        for color in ["cat-1", "cat-9", "cat-10", "cat-13", "cat-24"] {
            assert!(check_color(color).is_ok(), "{color}");
        }
        for color in ["cat-0", "cat-25", "cat-01", "#ff0000", "cat-", "cat-x"] {
            assert_eq!(field(check_color(color)), "color", "{color}");
        }
    }
}
