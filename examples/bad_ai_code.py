"""Example of typical AI-generated code with issues that VibeLint catches."""

import os
import json
import numpy
import pandas
from langchain.memory import ConversationBufferMemory
from fake_ml_lib import SuperModel


def process_data(data):
    """Process some data."""
    df = pandas.DataFrame(data)
    return df.describe()


def calculate_score(value):
    """Calculate a score."""
    return value * 0.85

# TODO: implement actual authentication  
API_KEY = "sk-proj-abc123def456ghi789jkl012mno345"
SECRET_TOKEN = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12"

try:
    result = risky_operation()
except Exception: pass

import logging
console_output = print(f"debug: user_data = {user_data}")
