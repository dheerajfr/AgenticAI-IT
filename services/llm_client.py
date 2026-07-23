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
    Directly calls the Azure OpenAI API to generate content or structured JSON.
    Uses the provided api_key or falls back to Entra ID or the AZURE_OPENAI_API_KEY environment variable.
    """
    try:
        from openai import OpenAI
        from azure.identity import DefaultAzureCredential, get_bearer_token_provider
    except ImportError:
        raise ImportError(
            "The 'openai' or 'azure-identity' package is not installed."
        )

    endpoint = "https://karthiksajja9098-2712-resource.services.ai.azure.com/openai/v1"
    deployment_name = model_name or "gpt-4.1-mini"
    
    # Try using AZURE_OPENAI_API_KEY, else use Entra ID token provider
    env_api_key = api_key or os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY")

    if env_api_key:
        client = OpenAI(
            base_url=endpoint,
            api_key=env_api_key
        )
    else:
        token_provider = get_bearer_token_provider(DefaultAzureCredential(), "https://ai.azure.com/.default")
        client = OpenAI(
            base_url=endpoint,
            api_key=token_provider
        )

    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    
    response_format = None
    if is_json:
        response_format = {"type": "json_object"}

    response = client.chat.completions.create(
        model=deployment_name,
        messages=messages,
        response_format=response_format
    )
    
    text = response.choices[0].message.content.strip()
    
    if is_json:
        try:
            return json.loads(text)
        except Exception:
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            return json.loads(text.strip())
    else:
        return text