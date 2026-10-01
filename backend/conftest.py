"""pytest support for test_app.py.

test_app.py started life as a script (`python test_app.py`), where the XLM-R
tokenizer is built once in __main__ and passed to test_slots by hand. Under
pytest that argument has to come from a fixture.
"""
import pytest


@pytest.fixture(scope="session")
def tok():
    from transformers import AutoTokenizer
    return AutoTokenizer.from_pretrained("xlm-roberta-base")
