class TransferFlow:
    def __init__(self, balance):
        self.state = "ask_name"
        self.data = {}
        self.balance = balance

    def next(self, user_input):
        if self.state == "ask_name":
            self.data["name"] = user_input
            self.state = "ask_bank"
            return "Which bank?"

        elif self.state == "ask_bank":
            self.data["bank"] = user_input
            self.state = "ask_account"
            return "Enter account number?"

        elif self.state == "ask_account":
            acc = user_input.strip()
            self.data["account"] = acc[-4:]
            self.state = "ask_amount"
            return "Enter amount?"

        elif self.state == "ask_amount":
            try:
                amount = int(user_input)
            except:
                return "Invalid amount. Please enter a number."

            if amount <= 0:
                return "Amount must be greater than zero."

            if amount > self.balance:
                return "Insufficient balance."

            self.data["amount"] = amount
            self.state = "confirm"
            return f"Confirm transfer of ₹{amount} to {self.data['name']} (XXXX{self.data['account']})? Say yes to proceed."

        elif self.state == "confirm":
            if "yes" in user_input.lower():
                self.balance -= self.data["amount"]
                self.state = "done"
                return f"Transaction successful! Remaining balance is ₹{self.balance}"
            else:
                self.state = "cancelled"
                return "Transaction cancelled."