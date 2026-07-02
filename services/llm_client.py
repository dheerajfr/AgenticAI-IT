import os
import json
from typing import Dict, Any, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def call_gemini(
    prompt: str,
    system_instruction: Optional[str] = None,
    is_json: bool = False,
    api_key: Optional[str] = None,
    model_name: str = "gemini-1.5-flash"
) -> Any:
    """
    Directly calls the Google Gemini API to generate content or structured JSON.
    Uses the provided api_key or falls back to the GEMINI_API_KEY environment variable.
    """
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        raise ValueError(
            "GEMINI_API_KEY is not set. Please set the GEMINI_API_KEY environment variable "
            "or pass it as an argument."
        )

    try:
        import google.generativeai as genai
    except ImportError:
        raise ImportError(
            "The 'google-generativeai' package is not installed. "
            "Please run 'pip install google-generativeai' or install requirements.txt."
        )

    genai.configure(api_key=key)
    
    if system_instruction:
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction
        )
    else:
        model = genai.GenerativeModel(model_name)

    if is_json:
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        text = response.text.strip()
        try:
            return json.loads(text)
        except Exception:
            # Safe parsing fallback if Gemini outputs markdown wrappers (```json ... ```)
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            return json.loads(text.strip())
    else:
        response = model.generate_content(prompt)
        return response.text
