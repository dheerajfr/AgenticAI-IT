import sys
import os
import importlib.util

def load_service(service_name):
    # Clear generic local modules from sys.modules to prevent cross-contamination
    # because different services use the same file names (models.py, database.py, etc.)
    modules_to_remove = [k for k in sys.modules.keys() if k in ['models', 'database', 'orchestration'] or k.startswith('orchestration.')]
    for m in modules_to_remove:
        sys.modules.pop(m, None)
        
    path = os.path.join(os.path.dirname(__file__), "services", service_name, "main.py")
    spec = importlib.util.spec_from_file_location(f"{service_name}_main", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[f"{service_name}_main"] = mod
    
    # Add service dir to path temporarily so internal imports work
    service_dir = os.path.dirname(path)
    sys.path.insert(0, service_dir)
    spec.loader.exec_module(mod)
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
<<<<<<< HEAD
print("Loading build-deploy service...")
build_deploy_app = load_service("build-deploy")
print("Loading release-change service...")
release_change_app = load_service("release-change")
=======
print("Loading release-change service...")
release_change_app = load_service("release-change")
print("Loading build-deploy service...")
build_deploy_app = load_service("build-deploy")
print("Loading test-quality service...")
test_quality_app = load_service("test-quality")
>>>>>>> main
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
<<<<<<< HEAD
        elif path.startswith("/api/deployments"):
            await build_deploy_app(scope, receive, send)
            return
        elif path.startswith("/api/release-change"):
            await release_change_app(scope, receive, send)
=======
        elif path.startswith("/api/release-change"):
            await release_change_app(scope, receive, send)
            return
        elif path.startswith("/api/deployments"):
            await build_deploy_app(scope, receive, send)
            return
        elif path.startswith("/api/test-quality"):
            await test_quality_app(scope, receive, send)
>>>>>>> main
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
