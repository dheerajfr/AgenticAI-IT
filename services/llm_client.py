import os
import json
from typing import Dict, Any, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from langsmith import traceable
except ImportError:
    def traceable(*args, **kwargs):
        def decorator(func):
            return func
        if len(args) == 1 and callable(args[0]):
            return args[0]
        return decorator

@traceable(name="call_gemini")
def call_gemini(
    prompt: str,
    system_instruction: Optional[str] = None,
    is_json: bool = False,
    api_key: Optional[str] = None,
    model_name: Optional[str] = None
) -> Any:
    """
    Directly calls the Google Gemini API to generate content or structured JSON.
    Uses the provided api_key or falls back to the GEMINI_API_KEY environment variable.
    """
    key = api_key or os.getenv("GEMINI_API_KEY")
    actual_model = model_name or os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")
    if not key:
        raise ValueError(
            "GEMINI_API_KEY is not set. Please set the GEMINI_API_KEY environment variable "
            "or pass it as an argument."
        )

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise ImportError(
            "The 'google-genai' package is not installed. "
            "Please run 'pip install google-genai' or install requirements.txt."
        )

    client = genai.Client(api_key=key)
    config = types.GenerateContentConfig()
    
    if system_instruction:
        config.system_instruction = system_instruction
        
    if is_json:
        config.response_mime_type = "application/json"

    response = client.models.generate_content(
        model=actual_model,
        contents=prompt,
        config=config
    )
    
    text = response.text.strip()
    
    if is_json:
        try:
            return json.loads(text)
        except Exception:
            # Safe parsing fallback if Gemini outputs markdown wrappers
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            return json.loads(text.strip())
    else:
        return text
