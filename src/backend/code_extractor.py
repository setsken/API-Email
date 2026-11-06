import html
import re

# Words that usually sit next to a one-time code ("kod" is how people type "код" in latin)
_KEYWORDS = r"\b(?i:code|kod|pin|otp|passcode|verification|код\w*|подтвержд\w*|пароль)\b"

# Digits of a code; a year doesn't count ("© 2026 ... Code of Conduct")
_CODE_DIGITS = r"\b((?!(?:19|20)\d\d\b)\d{4,8})\b"

# A code next to one of those words. Reliable enough to trust in any email
_PATTERNS = [
    # "Your code is 123456", "Код подтверждения: 4821", "Enter this code within 24 hours: 77812"
    re.compile(_KEYWORDS + r"(?:[^\d]|\b\d{1,3}\b){0,30}?" + _CODE_DIGITS),
    # "123456 is your Instagram code"
    re.compile(_CODE_DIGITS + r"[^\d]{0,30}?" + _KEYWORDS),
    # "Code: X7K9QZ" (letters and digits mixed)
    re.compile(_KEYWORDS + r"\W{1,5}((?=[A-Z]*\d)(?=\d*[A-Z])[A-Z0-9]{4,8})\b"),
]

# Guesses without a keyword: a long number in the subject (5+ digits so years
# don't match), or a body line holding nothing but the code
_SUBJECT_NUMBER = re.compile(r"\b(\d{5,8})\b")
_CODE_LINE = re.compile(r"^[ \t]*((?=[A-Z]*\d)[A-Z0-9]{5,8})[ \t]*$", re.MULTILINE)

# Also a guess: in a short email, a lone 6-8 digit number is the code. Numbers
# glued to dots, commas, colons, slashes or dashes (dates, prices, times) don't count
SHORT_EMAIL_CHARS = 300
_LONE_NUMBER = re.compile(r"(?<![\d.,:/-])(\d{6,8})(?![\d]|[.,:/-]\d)")

# Emails that only inform: new login, new subscriber... They have links and
# numbers but nothing to enter or confirm, so guesses aren't made for them
_NOTIFICATION = re.compile(
    r"(?i)new login|new sign[- ]?in|new device|login alert|security alert|was this you"
    r"|just subscribed|subscribed to your|new subscriber|new follower|started following|liked your"
    r"|new message|sent you a (?:new )?message|new tip|tipped you|new purchase|payout|invoice|receipt"
    r"|новый вход|новое устройство|новый подписчик|подписал(?:ся|ась) на|новое сообщение"
)
# ...unless the subject itself asks to confirm something: "Verify your new device"
_ASKS_TO_CONFIRM = re.compile(r"(?i)verif|confirm|подтвержд")

_URL = re.compile(r"https?://[^\s\"'<>]+")

# A link that confirms something: /emailverify/..., /confirm-email...
_CONFIRM_LINK = re.compile(r"(?i)verif|confirm|activat|validat|magic")
# A link that only counts when the subject is about exactly that: "Reset your password"
_ACTION_LINK = re.compile(r"(?i)log-?in|sign-?in|auth|token|reset|password|recover")
_ACTION_SUBJECT = re.compile(r"(?i)reset|recover|sign[- ]?in|log[- ]?in|вход|войти|сброс|восстанов")
# Links that are never the one to click: "turn on 2-step verification", help pages, images
_LINK_SKIP = re.compile(r"(?i)unsubscribe|two-?step|2-?step|2fa|//help\.|/help\b|//support\.|/support\b"
                        r"|\.(png|jpe?g|gif|svg|css|ico)(\?|$)")

# Turns a stored email body into plain text, keeping line breaks
def html_to_text(body: str) -> str:
    body = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", " ", body)
    body = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|td|table|h\d)>", "\n", body)
    body = re.sub(r"<[^>]+>", " ", body)
    return html.unescape(body)

def _is_notification(subject: str, text: str) -> bool:
    return not _ASKS_TO_CONFIRM.search(subject) and bool(_NOTIFICATION.search(f"{subject}\n{text}"))

# Finds the one-time code in an email, or returns None
def extract_code(subject: str, body: str):
    subject = subject or ""
    text = html_to_text(body or "")

    for pattern in _PATTERNS:
        for source in (subject, text):
            match = pattern.search(source)
            if match:
                return match.group(1)

    if _is_notification(subject, text):
        return None

    match = _SUBJECT_NUMBER.search(subject) or _CODE_LINE.search(text)
    if match:
        return match.group(1)

    # numbers inside links (ids, tracking) are not codes
    plain = _URL.sub(" ", text)
    if len(plain.strip()) <= SHORT_EMAIL_CHARS:
        numbers = set(_LONE_NUMBER.findall(plain))
        if len(numbers) == 1:
            return numbers.pop()

    return None

# Finds a verification / sign-in link in an email, or returns None
def extract_link(subject: str, body: str):
    subject = subject or ""
    body = body or ""

    if _is_notification(subject, html_to_text(body)):
        return None

    action_subject = _ACTION_SUBJECT.search(subject)
    for url in _URL.findall(body):
        url = html.unescape(url).rstrip(".,;)")
        if _LINK_SKIP.search(url):
            continue
        if _CONFIRM_LINK.search(url) or (action_subject and _ACTION_LINK.search(url)):
            return url

    return None
