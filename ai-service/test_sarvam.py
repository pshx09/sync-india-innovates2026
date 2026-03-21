import requests
import os

key = "sk_nomuidpw_hi8jKPFNzlANW07QlFya6sJI"
url = "https://api.sarvam.ai/speech-to-text-translate"
headers = {"api-subscription-key": key}

with open("dummy.wav", "wb") as f:
    f.write(b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00")

with open("dummy.wav", "rb") as f:
    files = {"file": ("dummy.wav", f, "audio/wav")}
    res = requests.post(url, headers=headers, files=files, data={"prompt": ""})

print(res.status_code)
print(res.text)
