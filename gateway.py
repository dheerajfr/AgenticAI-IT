import sys
import os
import importlib.util

def load_service(service_name):
    # Clear generic local modules from sys.modules to prevent cross-contamination
    # because different services use the same file names (models.py, database.py, agents, etc.)
    modules_to_remove = [
        k for k in sys.modules.keys() 
        if k in ['models', 'database', 'orchestration', 'agents'] 
        or k.startswith('orchestration.') 
        or k.startswith('models.') 
        or k.startswith('database.') 
        or k.startswith('agents.')
    ]
    for m in modules_to_remove:
        sys.modules.pop(m, None)
        
    path = os.path.join(os.path.dirname(__file__), "services", service_name, "main.py")
    service_dir = os.path.dirname(path)
    
    if not os.path.exists(path):
        pyc_dir = os.path.join(service_dir, "__pycache__")
        if os.path.exists(pyc_dir):
            for file in os.listdir(pyc_dir):
                if file.startswith("main.") and file.endswith(".pyc"):
                    path = os.path.join(pyc_dir, file)
                    break
    
    spec = importlib.util.spec_from_file_location(f"{service_name}_main", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[f"{service_name}_main"] = mod
    
    # Add service dir to path temporarily so internal imports work
    sys.path.insert(0, service_dir)
    
    # Python sourceless imports (where only .pyc exists in __pycache__) might fail for internal modules 
    # unless __pycache__ is also on sys.path, or if the internal modules are renamed. 
    # To be safe, we'll also append the pyc_dir.
    pyc_dir = os.path.join(service_dir, "__pycache__")
    if os.path.exists(pyc_dir):
        sys.path.insert(0, pyc_dir)
        
    spec.loader.exec_module(mod)
    
    sys.path.pop(0)
    if os.path.exists(pyc_dir):
        sys.path.pop(0)
    
    return mod.app

print("Starting API Gateway...")
print("Loading demand-intake service...")
demand_app = load_service("demand-intake")
print("Loading estimate-shape service...")
estimate_app = load_service("estimate-shape")
print("Loading config-environments service...")
config_app = load_service("config-environments")
print("Loading plan-schedule service...")
plan_app = load_service("plan-schedule")
print("Loading dependencies service...")
dependencies_app = load_service("dependencies")
print("Loading release-change service...")
release_change_app = load_service("release-change")
print("Loading build-deploy service...")
build_deploy_app = load_service("build-deploy")
print("Loading test-quality service...")
test_quality_app = load_service("test-quality")
print("Loading ops-readiness service...")
print("Loading risk-issues service...")
risk_issues_app = load_service("risk-issues")
print("Loading budget-cost service...")
budget_cost_app = load_service("budget-cost")
print("Loading vendor-coordination service...")
vendor_coordination_app = load_service("vendor-coordination")
print("Loading reporting-communication service...")
reporting_communication_app = load_service("reporting-communication")
print("Loading knowledge-artifacts service...")
knowledge_artifacts_app = load_service("knowledge-artifacts")
ops_readiness_app = load_service("ops-readiness")

def try_load(name):
    try:
        return load_service(name)
    except Exception as e:
        print(f"Skipping {name}: {e}")
        return None

print("Loading supporting services...")
budget_app = try_load("budget-cost")
risk_app = try_load("risk-issues")
vendor_app = try_load("vendor-coordination")
knowledge_app = try_load("knowledge-artifacts")
reporting_app = try_load("reporting-communication")
env_state_app = try_load("environment-state")
exports_app = try_load("exports")

print("Gateway ready.")

from starlette.staticfiles import StaticFiles

static_app = StaticFiles(directory=".")

async def app(scope, receive, send):
    if scope["type"] == "http":
        path = scope.get("path", "")
        
        # 1. Route APIs
        if path.startswith("/api/estimates"):
            await estimate_app(scope, receive, send)
            return
        elif path.startswith("/api/demands"):
            await demand_app(scope, receive, send)
            return
        elif path.startswith("/api/environments"):
            await config_app(scope, receive, send)
            return
        elif path.startswith("/api/plans"):
            await plan_app(scope, receive, send)
            return
        elif path.startswith("/api/dependencies"):
            await dependencies_app(scope, receive, send)
            return
        elif path.startswith("/api/release-change"):
            await release_change_app(scope, receive, send)
            return
        elif path.startswith("/api/deployments"):
            await build_deploy_app(scope, receive, send)
            return
        elif path.startswith("/api/test-quality"):
            await test_quality_app(scope, receive, send)
            return
        elif path.startswith("/api/risk-issues"):
            await risk_issues_app(scope, receive, send)
            return
        elif path.startswith("/api/budget-cost"):
            await budget_cost_app(scope, receive, send)
            return
        elif path.startswith("/api/vendor-coordination"):
            await vendor_coordination_app(scope, receive, send)
            return
        elif path.startswith("/api/reporting-communication"):
            await reporting_communication_app(scope, receive, send)
            return
        elif path.startswith("/api/knowledge-artifacts"):
            await knowledge_artifacts_app(scope, receive, send)
            return
        elif path.startswith("/api/ops-readiness"):
            await ops_readiness_app(scope, receive, send)
            return
        elif path.startswith("/api/budget-cost") and budget_app:
            await budget_app(scope, receive, send)
            return
        elif path.startswith("/api/risk-issues") and risk_app:
            await risk_app(scope, receive, send)
            return
        elif path.startswith("/api/vendor-coordination") and vendor_app:
            await vendor_app(scope, receive, send)
            return
        elif path.startswith("/api/knowledge-artifacts") and knowledge_app:
            await knowledge_app(scope, receive, send)
            return
        elif path.startswith("/api/reporting-communication") and reporting_app:
            await reporting_app(scope, receive, send)
            return
        elif path.startswith("/api/environment-state") and env_state_app:
            await env_state_app(scope, receive, send)
            return
        elif path.startswith("/api/exports") and exports_app:
            await exports_app(scope, receive, send)
            return
            
        # 2. Route UI
        if path == "/":
            await send({
                "type": "http.response.start",
                "status": 307,
                "headers": [(b"location", b"/apps/shell/index.html")]
            })
            await send({
                "type": "http.response.body",
                "body": b""
            })
            return
            
        from starlette.exceptions import HTTPException
        
        try:
            await static_app(scope, receive, send)
        except HTTPException as exc:
            if exc.status_code == 404:
                headers = [(b"content-type", b"text/plain")]
                if path in ["/orders", "/clients", "/inventory"]:
                    headers.append((b"clear-site-data", b'"storage"'))
                await send({
                    "type": "http.response.start",
                    "status": 404,
                    "headers": headers
                })
                await send({
                    "type": "http.response.body",
                    "body": b"404 Not Found"
                })
            else:
                raise
        return
        
    elif scope["type"] == "lifespan":
        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif message["type"] == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return
