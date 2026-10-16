import html
import re

# Words that usually sit next to a one-time code
_KEYWORDS = r"\b(?i:code|pin|otp|passcode|verification|код\w*|подтвержд\w*|пароль)\b"

_PATTERNS = [
    # "Your code is 123456", "Код подтверждения: 4821"
    re.compile(_KEYWORDS + r"[^\d]{0,30}?\b(\d{4,8})\b"),
    # "123456 is your Instagram code"
    re.compile(r"\b(\d{4,8})\b[^\d]{0,30}?" + _KEYWORDS),
    # "Code: X7K9QZ" (letters and digits mixed)
    re.compile(_KEYWORDS + r"\W{1,5}((?=[A-Z]*\d)(?=\d*[A-Z])[A-Z0-9]{4,8})\b"),
]

# Fallbacks without a keyword: a long number in the subject (5+ digits so
# years don't match), or a body line holding nothing but the code
_SUBJECT_NUMBER = re.compile(r"\b(\d{5,8})\b")
_CODE_LINE = re.compile(r"^[ \t]*((?=[A-Z]*\d)[A-Z0-9]{4,8})[ \t]*$", re.MULTILINE)

# Links worth clicking (verify, confirm, magic sign-in...) and links to skip
_URL = re.compile(r"https?://[^\s\"'<>]+")
_LINK_KEYWORDS = re.compile(r"(?i)verif|confirm|activat|validat|magic|log-?in|sign-?in|auth|token|reset|password")
_LINK_SKIP = re.compile(r"(?i)unsubscribe|\.(png|jpe?g|gif|svg|css|ico)(\?|$)")

# Turns a stored email body into plain text, keeping line breaks
def html_to_text(body: str) -> str:
    body = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", " ", body)
    body = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|td|table|h\d)>", "\n", body)
    body = re.sub(r"<[^>]+>", " ", body)
    return html.unescape(body)

# Finds the one-time code in an email, or returns None
def extract_code(subject: str, body: str):
    subject = subject or ""
    text = html_to_text(body or "")

    for pattern in _PATTERNS:
        for source in (subject, text):
            match = pattern.search(source)
            if match:
                return match.group(1)

    match = _SUBJECT_NUMBER.search(subject) or _CODE_LINE.search(text)
    if match:
        return match.group(1)

    return None

# Finds a verification / sign-in link in an email body, or returns None
def extract_link(body: str):
    for url in _URL.findall(body or ""):
        url = html.unescape(url).rstrip(".,;)")
        if _LINK_KEYWORDS.search(url) and not _LINK_SKIP.search(url):
            return url

    return None
