import os
import sys
import pytest

# Add services folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import llm_client

def test_missing_api_key():
    """Verify that calling call_gemini raises ValueError if api_key is missing."""
    old_key = os.environ.pop("GEMINI_API_KEY", None)
    try:
        with pytest.raises(ValueError) as exc:
            llm_client.call_gemini("Say Hello")
        assert "GEMINI_API_KEY is not set" in str(exc.value)
    finally:
        if old_key is not None:
            os.environ["GEMINI_API_KEY"] = old_key


@pytest.mark.skipif(not os.environ.get("GEMINI_API_KEY"), reason="GEMINI_API_KEY not found in environment.")
def test_gemini_integration():
    """Verify live Gemini API content generation and structured JSON outputs."""
    # Test text generate
    response = llm_client.call_gemini("Explain API contracts in 5 words.")
    assert len(response.strip()) > 0
    
    # Test JSON generate
    json_response = llm_client.call_gemini(
        "Return a JSON object with fields: 'status' (string, value 'ok') and 'count' (number, value 1).",
        is_json=True
    )
    assert isinstance(json_response, dict)
    assert json_response.get("status") == "ok"
    assert json_response.get("count") == 1
