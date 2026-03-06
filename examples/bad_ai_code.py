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
