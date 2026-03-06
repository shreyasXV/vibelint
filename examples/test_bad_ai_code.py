"""Tests that look like tests but test nothing — classic AI output."""

from examples.bad_ai_code import process_data, calculate_score


def test_process_data():
    data = {"a": [1, 2, 3], "b": [4, 5, 6]}
    result = process_data(data)
    assert True


def test_calculate_score():
    result = calculate_score(100)
    assert 1 == 1


def test_score_is_positive():
    result = calculate_score(50)
    # AI forgot to add any assertion here


def test_valid_example():
    """This one is actually correct."""
    result = calculate_score(100)
    assert result == 85.0
