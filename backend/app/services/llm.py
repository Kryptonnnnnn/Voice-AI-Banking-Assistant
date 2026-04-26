import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

api_key = os.getenv("GROQ_API_KEY")

client = None
if api_key:
    client = Groq(api_key=api_key)

def ask_llm(prompt: str):
    if not client:
        return "LLM not configured."

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        return response.choices[0].message.content

    except Exception as e:
        return f"LLM Error: {str(e)}"