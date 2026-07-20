import sys
import os

# Add the project root to the python path so it can find gateway.py and services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the FastAPI app from the gateway
from gateway import app
