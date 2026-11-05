use soldi_types::categories::{Category, CategoryKind};
use uuid::Uuid;

use crate::error::{AppError, reject_nul};

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

pub const DEFAULT_ICON: &str = "circle-dashed";

pub struct Seed {
    pub name: &'static str,
    pub kind: CategoryKind,
    pub icon: &'static str,
    pub color: String,
}

/// `cat-1..cat-12` in order (docs/design/tokens.md).
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

/// The defaults with their colors: the palette's twelve take their own token, the others
/// share the palette round-robin in list order.
pub fn defaults() -> Vec<Seed> {
    let mut others = 0;
    DEFAULTS
        .iter()
        .map(|&(name, kind, icon)| {
            let index = PALETTE.iter().position(|&owner| owner == name);
            let color = color_for(index.unwrap_or_else(|| {
                others += 1;
                others - 1
            }));
            Seed {
                name,
                kind,
                icon,
                color,
            }
        })
        .collect()
}

/// The token for the category at `index` among those of its kind.
pub fn color_for(index: usize) -> String {
    format!("cat-{}", index % 12 + 1)
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
    let canonical = number.is_some_and(|n| (1..=12).contains(&n) && color == format!("cat-{n}"));
    if !canonical {
        return Err(AppError::invalid("color", "must be one of cat-1 to cat-12"));
    }
    Ok(())
}

/// `parent` may hold the category `id` (none when creating) of `kind`: a top-level category of the
/// same kind, not itself, and only when `id` has no subcategories of its own.
pub fn check_parent(
    id: Option<Uuid>,
    kind: CategoryKind,
    has_children: bool,
    parent: &Category,
) -> Result<(), AppError> {
    if parent.kind != kind {
        return Err(AppError::invalid("parent_id", "must be of the same kind"));
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

        assert_eq!(seeds.len(), 30);
        assert_eq!(count(CategoryKind::Income), 3);
        assert_eq!(count(CategoryKind::Bill), 12);
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
    }

    #[test]
    fn the_twelve_named_defaults_own_the_palette_and_the_rest_share_it() {
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
        ] {
            assert_eq!(color(name), token, "{name}");
        }
        assert_eq!(color("Reembolso"), "cat-1");
        assert_eq!(color("Condomínio"), "cat-2");
        assert_eq!(color("Casa"), "cat-12");
        assert_eq!(color("Pets"), "cat-1");
        assert_eq!(color("Outros"), "cat-6");
        assert_eq!(color_for(3), "cat-4");
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
        }
    }

    fn slug(result: Result<(), AppError>) -> &'static str {
        match result {
            Err(AppError::Rule { slug, .. }) => slug,
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_parent_is_a_top_level_category_of_the_same_kind() {
        let casa = category(1, CategoryKind::Daily, None);

        assert!(check_parent(None, CategoryKind::Daily, false, &casa).is_ok());
        assert!(check_parent(Some(Uuid::from_u128(2)), CategoryKind::Daily, false, &casa).is_ok());
        assert_eq!(
            field(check_parent(None, CategoryKind::Bill, false, &casa)),
            "parent_id"
        );
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
    fn colors_are_the_twelve_tokens() {
        for color in ["cat-1", "cat-9", "cat-10", "cat-12"] {
            assert!(check_color(color).is_ok(), "{color}");
        }
        for color in ["cat-0", "cat-13", "cat-01", "#ff0000", "cat-", "cat-x"] {
            assert_eq!(field(check_color(color)), "color", "{color}");
        }
    }
}
