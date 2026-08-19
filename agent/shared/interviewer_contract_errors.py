"""Stable cross-runtime error identity for interviewer contracts."""


class InterviewerContractError(ValueError):
    """Stable parser failure for the cross-language contract boundary."""

    def __init__(self, contract: str, code: str):
        self.contract = contract
        self.code = code
        super().__init__(f"Invalid {contract}: {code}")
