"""Architecture uploads pass the malware scan before anything parses or stores them."""

from fastapi.testclient import TestClient

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
RELEASES = "/architecture-knowledge/releases"
EICAR = b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE"


def _draft(client: TestClient) -> dict[str, object]:
    response = client.post(RELEASES, json={"name": "Scan checks"}, headers=OWNER)
    assert response.status_code == 201, response.text
    return dict(response.json())


def test_a_flagged_document_upload_is_refused_and_not_stored(client: TestClient) -> None:
    draft = _draft(client)
    base = f"{RELEASES}/{draft['id']}"

    refused = client.post(
        f"{base}/documents",
        data={"title": "Design", "language": "en", "expected_revision": str(draft["revision"])},
        files={"file": ("design.txt", EICAR, "text/plain")},
        headers=OWNER,
    )

    assert refused.status_code == 422, refused.text
    assert refused.json()["code"] == "malware_rejected"
    release = client.get(base, headers=OWNER).json()
    assert release["documents"] == []
    assert release["revision"] == draft["revision"]


def test_a_flagged_file_in_a_batch_is_refused_while_the_rest_are_added(
    client: TestClient,
) -> None:
    draft = _draft(client)
    base = f"{RELEASES}/{draft['id']}"

    response = client.post(
        f"{base}/documents/batch",
        data={"language": "en", "expected_revision": str(draft["revision"])},
        files=[
            ("files", ("clean.txt", b"System: Order Hub\n", "text/plain")),
            ("files", ("flagged.txt", EICAR, "text/plain")),
        ],
        headers=OWNER,
    )

    assert response.status_code == 201, response.text
    outcomes = {item["filename"]: item for item in response.json()["results"]}
    assert outcomes["clean.txt"]["outcome"] == "added"
    assert outcomes["flagged.txt"]["outcome"] == "refused"
    assert "Malware scan rejected" in outcomes["flagged.txt"]["reason"]
    release = client.get(base, headers=OWNER).json()
    assert [item["filename"] for item in release["documents"]] == ["clean.txt"]


def test_a_flagged_catalogue_file_is_refused_by_preview_and_import(client: TestClient) -> None:
    draft = _draft(client)
    base = f"{RELEASES}/{draft['id']}"

    preview = client.post(
        f"{base}/catalogue-file/preview",
        files={"file": ("catalogue.yaml", EICAR, "application/yaml")},
        headers=OWNER,
    )
    assert preview.status_code == 422, preview.text
    assert preview.json()["code"] == "malware_rejected"

    imported = client.post(
        f"{base}/catalogue-file",
        data={"expected_revision": str(draft["revision"])},
        files={"file": ("catalogue.yaml", EICAR, "application/yaml")},
        headers=OWNER,
    )
    assert imported.status_code == 422, imported.text
    assert imported.json()["code"] == "malware_rejected"
    assert client.get(base, headers=OWNER).json()["revision"] == draft["revision"]
