use chrono::NaiveDate;
use rust_decimal::Decimal;
use soldi_types::categories::{Category, CategoryKind};
use uuid::Uuid;

use crate::error::{AppError, reject_nul};
use crate::settings::domain::check_money;

/// D29: the owner's standard; top-levels with a fixed color, unique across all outflow.
const TOPS: [(&str, CategoryKind, &str, &str); 14] = {
    use CategoryKind::{Bill, Daily, Income};
    [
        ("Salário", Income, "briefcase", "cat-11"),
        ("Extra", Income, "sparkles", "cat-12"),
        ("Reembolso", Income, "undo-2", "cat-1"),
        ("Alimentação", Daily, "utensils", "cat-1"),
        ("Gasto", Daily, "wallet", "cat-2"),
        ("Transporte", Daily, "bus", "cat-3"),
        ("Saúde", Bill, "heart-pulse", "cat-4"),
        ("Lazer", Daily, "gamepad-2", "cat-5"),
        ("Casa", Bill, "home", "cat-6"),
        ("Educação", Bill, "graduation-cap", "cat-7"),
        ("Veículo", Bill, "car", "cat-8"),
        ("Cartão", Bill, "credit-card", "cat-9"),
        ("Assinaturas", Bill, "repeat", "cat-10"),
        ("Família", Daily, "users", "cat-12"),
    ]
};

/// Subcategories by parent name; they wear the parent's color.
const CHILDREN: [(&str, &str, CategoryKind, &str); 25] = {
    use CategoryKind::{Bill, Daily};
    [
        ("Alimentação", "Mercado", Daily, "shopping-cart"),
        ("Alimentação", "Comer fora", Daily, "utensils-crossed"),
        ("Alimentação", "iFood", Daily, "bike"),
        ("Transporte", "Uber", Daily, "car-taxi-front"),
        ("Transporte", "Combustível", Daily, "fuel"),
        ("Saúde", "Plano de saúde", Bill, "shield-plus"),
        ("Saúde", "Farmácia", Daily, "pill"),
        ("Saúde", "Consultas", Daily, "stethoscope"),
        ("Lazer", "Viagem", Daily, "plane"),
        ("Casa", "Aluguel", Bill, "key-round"),
        ("Casa", "Financiamento", Bill, "landmark"),
        ("Casa", "Condomínio", Bill, "building-2"),
        ("Casa", "Luz", Bill, "zap"),
        ("Casa", "Água", Bill, "droplets"),
        ("Casa", "Internet", Bill, "wifi"),
        ("Casa", "Gás", Bill, "flame"),
        ("Educação", "Escola", Bill, "school"),
        ("Educação", "Cursos", Bill, "book-open"),
        ("Educação", "Material", Daily, "pencil"),
        ("Veículo", "Parcela", Bill, "receipt"),
        ("Veículo", "Seguro", Bill, "shield"),
        ("Veículo", "IPVA", Bill, "file-text"),
        ("Família", "Pets", Daily, "paw-print"),
        ("Família", "Presentes", Daily, "gift"),
        ("Família", "Mesada", Bill, "hand-coins"),
    ]
};

/// The savings categories (SOL-20), seeded after the top-levels.
const SAVINGS: [(&str, CategoryKind, &str); 2] = [
    ("Economia", CategoryKind::Bill, "cat-13"),
    ("Resgate", CategoryKind::Income, "cat-2"),
];

pub const DEFAULT_ICON: &str = "circle-dashed";

pub struct Seed {
    pub name: &'static str,
    pub kind: CategoryKind,
    pub icon: &'static str,
    pub color: String,
    pub is_savings: bool,
    pub parent: Option<&'static str>,
}

const TOKENS: u8 = 24;

/// The top-levels, the savings ones, then the subcategories in their parent's color.
pub fn defaults() -> Vec<Seed> {
    let top = |name, kind, icon, color: &str, is_savings| Seed {
        name,
        kind,
        icon,
        color: color.to_string(),
        is_savings,
        parent: None,
    };
    let tops = TOPS
        .iter()
        .map(|&(name, kind, icon, color)| top(name, kind, icon, color, false))
        .chain(
            SAVINGS
                .iter()
                .map(|&(name, kind, color)| top(name, kind, "piggy-bank", color, true)),
        );
    let children = CHILDREN.iter().map(|&(parent, name, kind, icon)| Seed {
        name,
        kind,
        icon,
        color: TOPS
            .iter()
            .find(|top| top.0 == parent)
            .map_or_else(String::new, |top| top.3.to_string()),
        is_savings: false,
        parent: Some(parent),
    });
    tops.chain(children).collect()
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

/// A category, top-level or subcategory, moves between `daily` and `bill`; `Economia`, its
/// cofrinhos and the income categories, `Resgate` included, keep their kind. `parent` is the category's parent.
pub fn check_kind_change(
    category: &Category,
    parent: Option<&Category>,
    kind: CategoryKind,
) -> Result<(), AppError> {
    if category.is_savings
        || is_cofrinho_parent(parent)
        || category.kind == CategoryKind::Income
        || kind == CategoryKind::Income
    {
        return Err(AppError::rule(
            "kind-locked",
            "Economia, its cofrinhos, Resgate and income categories keep their kind.",
        ));
    }
    Ok(())
}

pub fn duplicate_name(kind: CategoryKind, name: &str) -> AppError {
    AppError::conflict(
        "duplicate-name",
        &format!(
            "An active {} category named {name} already exists.",
            kind.as_str()
        ),
    )
}

pub fn category_has_bills() -> AppError {
    AppError::rule(
        "category-has-bills",
        "An active conta fixa uses this category; it cannot become daily.",
    )
}

pub fn category_has_card_entries() -> AppError {
    AppError::rule(
        "category-has-card-entries",
        "Entries on a card use this category; only a Diário entry goes on a card.",
    )
}

/// N1: trimmed, at most 140 characters; blank is none.
pub fn check_note(note: &str) -> Result<Option<String>, AppError> {
    reject_nul("note", note)?;
    let note = note.trim();
    if note.chars().count() > 140 {
        return Err(AppError::invalid(
            "note",
            "must have at most 140 characters",
        ));
    }
    Ok((!note.is_empty()).then(|| note.to_string()))
}

/// `target`, `deadline` and a `note` are set only on a cofrinho; a target is money greater than zero.
pub fn check_goal(
    cofrinho: bool,
    target: Option<Decimal>,
    deadline: Option<NaiveDate>,
    note: bool,
) -> Result<(), AppError> {
    if let Some(target) = target {
        if target <= Decimal::ZERO {
            return Err(AppError::invalid("target", "must be greater than zero"));
        }
        check_money("target", target)?;
    }
    if !cofrinho && (target.is_some() || deadline.is_some() || note) {
        return Err(AppError::rule(
            "not-a-cofrinho",
            "Only a subcategory of Economia has a target, a deadline or a note.",
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
    fn the_defaults_are_the_owners_standard() {
        let seeds = defaults();
        assert_eq!(seeds.len(), 41);
        assert_eq!(
            seeds.iter().filter(|seed| seed.parent.is_none()).count(),
            16
        );
        let outflow: Vec<&str> = seeds
            .iter()
            .filter(|seed| seed.parent.is_none() && seed.kind != CategoryKind::Income)
            .map(|seed| seed.color.as_str())
            .collect();
        let unique: std::collections::HashSet<_> = outflow.iter().collect();
        assert_eq!(
            unique.len(),
            outflow.len(),
            "outflow top-levels share a color"
        );
        assert!(!outflow.contains(&"cat-11"));
        for seed in &seeds {
            assert!(check_icon(seed.icon).is_ok(), "{}", seed.icon);
            if let Some(parent) = seed.parent {
                let top = seeds
                    .iter()
                    .find(|each| each.name == parent && each.parent.is_none())
                    .unwrap();
                assert_eq!(seed.color, top.color, "{}", seed.name);
                assert!(!top.is_savings);
            }
        }
        let veiculo: Vec<_> = seeds
            .iter()
            .filter(|seed| seed.parent == Some("Veículo"))
            .map(|seed| seed.name)
            .collect();
        assert_eq!(veiculo, ["Parcela", "Seguro", "IPVA"]);
        assert_eq!(
            (seeds[0].name, seeds[0].icon, seeds[0].color.as_str()),
            ("Salário", "briefcase", "cat-11")
        );
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
        assert!(check_goal(true, Some(Decimal::new(1000000, 2)), deadline, false).is_ok());
        assert!(check_goal(false, None, None, false).is_ok());
        assert_eq!(
            slug(check_goal(false, None, deadline, false)),
            "not-a-cofrinho"
        );
        assert_eq!(
            slug(check_goal(false, Some(Decimal::ONE), None, false)),
            "not-a-cofrinho"
        );
        for target in [Decimal::ZERO, Decimal::NEGATIVE_ONE, Decimal::new(1001, 3)] {
            assert_eq!(field(check_goal(true, Some(target), None, false)), "target");
        }
        assert_eq!(slug(check_not_savings(&economia)), "savings-category");
        assert_eq!(
            slug(check_parent(None, CategoryKind::Income, false, &resgate)),
            "savings-category"
        );
        assert!(check_not_savings(&category(3, CategoryKind::Daily, None)).is_ok());
        assert_eq!(slug(check_goal(false, None, None, true)), "not-a-cofrinho");
        assert!(check_goal(true, None, None, true).is_ok());
    }

    #[test]
    fn p4_a_note_is_trimmed_up_to_140_characters_and_blank_is_none() {
        assert_eq!(check_note("  Plano  ").unwrap().as_deref(), Some("Plano"));
        assert_eq!(check_note("   ").unwrap(), None);
        assert!(check_note(&"é".repeat(140)).unwrap().is_some());
        assert_eq!(field(check_note(&"a".repeat(141))), "note");
        assert_eq!(field(check_note("a\0b")), "note");
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

    #[test]
    fn a_daily_or_bill_category_changes_kind_top_level_or_not() {
        let casa = category(1, CategoryKind::Daily, None);
        assert!(check_kind_change(&casa, None, CategoryKind::Bill).is_ok());
        let feira = category(5, CategoryKind::Daily, Some(1));
        assert!(check_kind_change(&feira, Some(&casa), CategoryKind::Bill).is_ok());
        let mut economia = category(2, CategoryKind::Bill, None);
        economia.is_savings = true;
        let cofrinho = category(3, CategoryKind::Bill, Some(2));
        let salario = category(4, CategoryKind::Income, None);
        for (category, parent, kind, expected) in [
            (&economia, None, CategoryKind::Daily, "kind-locked"),
            (
                &cofrinho,
                Some(&economia),
                CategoryKind::Daily,
                "kind-locked",
            ),
            (&salario, None, CategoryKind::Bill, "kind-locked"),
            (&casa, None, CategoryKind::Income, "kind-locked"),
        ] {
            assert_eq!(slug(check_kind_change(category, parent, kind)), expected);
        }
    }
}
