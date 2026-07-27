import urllib.request, json

def fetch_module_data(demand_id: str):
    base_url = "http://127.0.0.1:8000/api"
    context = {}
    
    # Direct access endpoints
    direct = {
        "demand": f"{base_url}/demands/{demand_id}",
        "test_quality": f"{base_url}/test-quality/consolidated/{demand_id}",
        "release_change": f"{base_url}/release-change/quality-summary/{demand_id}"
    }
    
    for key, url in direct.items():
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status == 200:
                    context[key] = json.loads(response.read().decode())
        except Exception as e:
            context[key] = {"error": str(e)}

    # List endpoints to filter
    list_endpoints = {
        "estimate": f"{base_url}/estimates",
        "plan": f"{base_url}/plans",
        "dependencies": f"{base_url}/dependencies",
        "config_environments": f"{base_url}/environments",
        "deployments": f"{base_url}/deployments/info" # Deployments doesn't have a list of deployments endpoint!
    }
    
    for key, url in list_endpoints.items():
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    if isinstance(data, list):
                        # Filter
                        filtered = [d for d in data if str(d).find(demand_id) != -1]
                        context[key] = filtered[0] if len(filtered) == 1 else filtered
                    else:
                        context[key] = data
        except Exception as e:
            context[key] = {"error": str(e)}

    return context

print(json.dumps(fetch_module_data("DEM-2026-0001"), indent=2))
