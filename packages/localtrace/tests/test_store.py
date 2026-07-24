"""JSONLStore: round-trip, size rotation, retention, gzip."""
import gzip
import json

from localtrace.store import JSONLStore

from helpers import make_record


def test_write_read_roundtrip(tmp_path):
    store = JSONLStore(tmp_path)
    records = [
        make_record(trace_id="a" * 32, span_id=f"{i:016d}", name=f"s{i}") for i in range(3)
    ]
    store.write_records(records)
    assert list(store.iter_records()) == records
    files = store.files()
    assert len(files) == 1
    assert files[0].name.startswith("traces-") and files[0].name.endswith(".jsonl")
    # one valid JSON object per line
    lines = files[0].read_text(encoding="utf-8").splitlines()
    assert len(lines) == 3
    for line in lines:
        json.loads(line)


def test_size_rotation_creates_numbered_files(tmp_path):
    store = JSONLStore(tmp_path, max_file_mb=0.000001)  # ~1 byte: rotate every batch
    store.write_records([make_record(trace_id="a" * 32, span_id="1" * 16)])
    store.write_records([make_record(trace_id="b" * 32, span_id="2" * 16)])
    store.write_records([make_record(trace_id="c" * 32, span_id="3" * 16)])
    files = store.files()
    assert len(files) == 3
    assert sum(1 for f in files if ".001." in f.name) == 1
    assert sum(1 for f in files if ".002." in f.name) == 1
    assert len(list(store.iter_records())) == 3


def test_retention_deletes_old_files(tmp_path):
    old = tmp_path / "traces-2020-01-01.jsonl"
    old.write_text(
        json.dumps(make_record(trace_id="d" * 32, span_id="4" * 16)) + "\n", encoding="utf-8"
    )
    store = JSONLStore(tmp_path, retention_days=30)
    assert not old.exists()
    # a fresh write still works
    store.write_records([make_record(trace_id="e" * 32, span_id="5" * 16)])
    assert len(store.files()) == 1


def test_gzip_on_size_rotation(tmp_path):
    store = JSONLStore(tmp_path, max_file_mb=0.000001, gzip_rotated=True)
    first = make_record(trace_id="a" * 32, span_id="1" * 16)
    second = make_record(trace_id="b" * 32, span_id="2" * 16)
    store.write_records([first])
    store.write_records([second])
    gz_files = [f for f in store.files() if f.name.endswith(".jsonl.gz")]
    assert len(gz_files) == 1
    with gzip.open(gz_files[0], "rt", encoding="utf-8") as fh:
        assert json.loads(fh.read().strip()) == first
    assert list(store.iter_records()) == [first, second]


def test_write_after_close_is_noop(tmp_path):
    store = JSONLStore(tmp_path)
    store.close()
    store.write_records([make_record(trace_id="a" * 32, span_id="1" * 16)])
    assert store.files() == []
