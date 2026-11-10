use std::path::Path;

#[test]
fn committed_openapi_snapshot_matches_the_server() {
    let snapshot = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../web/openapi.json");
    let spec = soldi_server::openapi().to_pretty_json().unwrap() + "\n";
    if std::env::var_os("UPDATE_OPENAPI").is_some() {
        std::fs::write(&snapshot, &spec).unwrap();
    }
    let committed = std::fs::read_to_string(&snapshot).unwrap_or_default();
    assert!(
        committed == spec,
        "web/openapi.json is stale: run `UPDATE_OPENAPI=1 cargo test -p soldi-server --test openapi`"
    );
}

#[test]
fn every_operation_with_a_body_documents_its_422() {
    let spec = serde_json::to_value(soldi_server::openapi()).unwrap();
    let mut undocumented = Vec::new();
    for (path, operations) in spec["paths"].as_object().unwrap() {
        for (method, operation) in operations.as_object().unwrap() {
            if operation.get("requestBody").is_some() && operation["responses"].get("422").is_none()
            {
                undocumented.push(format!("{method} {path}"));
            }
        }
    }
    assert!(undocumented.is_empty(), "{undocumented:?}");
}

#[test]
fn bill_due_days_document_their_range() {
    let spec = serde_json::to_value(soldi_server::openapi()).unwrap();
    let due_day = &spec["components"]["schemas"]["CreateBill"]["properties"]["due_day"];
    assert_eq!(
        (&due_day["minimum"], &due_day["maximum"]),
        (&1.into(), &31.into()),
        "{due_day}"
    );
}

#[test]
fn operation_ids_are_unique() {
    let spec = serde_json::to_value(soldi_server::openapi()).unwrap();
    let mut seen = std::collections::HashSet::new();
    let mut repeated = Vec::new();
    for operations in spec["paths"].as_object().unwrap().values() {
        for operation in operations.as_object().unwrap().values() {
            let id = operation["operationId"].as_str().unwrap_or_default();
            if !seen.insert(id) {
                repeated.push(id);
            }
        }
    }
    assert!(repeated.is_empty(), "{repeated:?}");
}

#[test]
fn the_spreadsheet_importer_is_gone() {
    let spec = serde_json::to_value(soldi_server::openapi()).unwrap();
    let imports: Vec<&String> = spec["paths"]
        .as_object()
        .unwrap()
        .keys()
        .filter(|path| path.starts_with("/api/imports"))
        .collect();
    assert!(imports.is_empty(), "{imports:?}");
}
