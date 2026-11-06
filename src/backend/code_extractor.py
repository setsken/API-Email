import html
import re

# An email is only kept if something here finds a code or a link in it, so a
# miss loses the email. Detection goes from sure signs to guesses, and the
# guesses are skipped for emails that only inform (new login, new subscriber...)

# Words that sit right next to a one-time code ("kod" is how people type "код" in latin)
_KEYWORDS = r"\b(?i:code|kod|pin|otp|passcode|verification|код\w*|подтвержд\w*|пароль)\b"

# Words that often come with a code, but also in emails without one
_SOFT_KEYWORDS = r"\b(?i:verify|confirm|password|enter|введите)\b"

# Between a keyword and its code: any text, up to a small number. "code within 24 hours: 77812"
_GAP = r"(?:[^\d]|\b\d{1,3}\b){0,30}?"

# Digits of a code; a year doesn't count ("© 2026 ... Code of Conduct")
_DIGITS = r"\b((?!(?:19|20)\d\d\b)\d{4,8})\b"

# A code split in parts: "123 456", "1234-5678", "12 34 56"
_SPLIT_DIGITS = r"(?<![\d-])(\d{3}[ -]\d{3}|\d{4}[ -]\d{4}|\d{2}[ -]\d{2}[ -]\d{2})(?![ -]?\d)"

# Letters and digits mixed, right after a keyword: "Code: X7K9QZ", "code is a1b2c3"
_TOKEN = r"\W{1,5}(?:(?i:is|это)\W{1,3})?((?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z0-9]{4,10})\b"

_SURE_PATTERNS = [
    re.compile(_KEYWORDS + _GAP + _SPLIT_DIGITS),
    # "Your code is 123456", "Код подтверждения: 4821"
    re.compile(_KEYWORDS + _GAP + _DIGITS),
    # "123456 is your Instagram code"
    re.compile(_DIGITS + r"[^\d]{0,30}?" + _KEYWORDS),
    re.compile(_KEYWORDS + _TOKEN),
    # only letters, after a colon: "Code: ABCDEF"
    re.compile(_KEYWORDS + r"\s*:\s*([A-Z]{5,8})\b"),
]

_SOFT_PATTERNS = [
    re.compile(_SOFT_KEYWORDS + _GAP + _SPLIT_DIGITS),
    # "Enter 482913 on the site"
    re.compile(_SOFT_KEYWORDS + _GAP + _DIGITS),
    # "Use 482913 to verify your account"
    re.compile(_DIGITS + r"[^\d]{0,30}?" + _SOFT_KEYWORDS),
]

# A long number in the subject (5+ digits so years don't match)
_SUBJECT_NUMBER = re.compile(r"(?<![#$€£.,:/-])\b(\d{5,8})\b")
# A body line holding nothing but the code, the way most code emails show it
_CODE_LINE = re.compile(r"^[ \t]*((?=[A-Z]*\d)[A-Z0-9]{5,8})[ \t]*$", re.MULTILINE)
# A code made to stand out: "Please use <b>445566</b>"
_EMPHASIZED = re.compile(r"(?i)<(?:b|strong|h[1-6]|code|kbd|tt)\b[^>]*>\s*((?=[A-Za-z]*\d)[A-Za-z0-9]{6,8})\s*<")

# A lone number is the code if the subject speaks of one, or if the email is short
# and the number long. Numbers glued to dots, commas, colons, slashes, dashes or
# currency signs (dates, prices, times) don't count
_LONE_NUMBER = re.compile(r"(?<![\d.,:/#$€£-])(\d{4,8})(?![\d]|[.,:/-]\d)")
_YEAR = re.compile(r"(?:19|20)\d\d")
_CODE_SUBJECT = re.compile(r"(?i)verif|confirm|\bcode\b|\botp\b|\bpin\b|log[\s-]?in|sign[\s-]?in|код|подтвержд|вход|авториз")
SHORT_EMAIL_CHARS = 300

# Emails that only inform: they have links and numbers but nothing to enter or confirm
_NOTIFICATION = re.compile(
    r"(?i)new login|new sign[- ]?in|new device|login alert|security alert|was this you"
    r"|just subscribed|subscribed to your|new subscriber|new follower|started following|liked your"
    r"|new message|sent you a (?:new )?message|new tip|tipped you|new purchase|payout|invoice|receipt"
    r"|\b(?:order|ticket)\b\W{0,3}\d"
    r"|новый вход|новое устройство|новый подписчик|подписал(?:ся|ась) на|новое сообщение|\b(?:заказ|тикет)\b\W{0,3}\d"
)
# ...unless the subject itself asks to confirm something: "Verify your new device"
_ASKS_TO_CONFIRM = re.compile(r"(?i)verif|confirm|подтвержд")
# A creator changed a subscription's price. These do ask to confirm, with a button
# and maybe in the subject, but that is about paying and not about an account
_PRICE_CHANGE = re.compile(
    r"(?i)subscription price|\bnew price\b|\bprice (?:change|increase)|\bchanged?\b.{0,30}?\bprice\b|\bkeep supporting\b"
    r"|\b(?:цен\w*|стоимост\w*) подписки|\bнов\w+ цен\w+|\bизменил\w* (?:цену|стоимость)|\bизменени\w+ цен\w+|\bпродолж\w+ поддерживать"
)

_URL =re.compile(r"https?://[^\s\"'<>]+")
_ANCHOR = re.compile(r"""(?is)<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>(.*?)</a>""")

# A link or button that confirms something: /emailverify/..., "Подтвердить почту"
_CONFIRM_LINK = re.compile(r"(?i)verif|confirm|activat|validat|magic|подтверд|активир")
# One that only counts when the subject is about exactly that: "Reset your password"
_ACTION_LINK = re.compile(r"(?i)log[\s-]?in|sign[\s-]?in|auth|token|reset|password|recover|войти|вход|сброс|восстанов")
_ACTION_SUBJECT = re.compile(r"(?i)reset|recover|sign[- ]?in|log[- ]?in|вход|войти|сброс|восстанов")
# Never the one to click: "turn on 2-step verification", help pages, images
_LINK_SKIP = re.compile(r"(?i)unsubscribe|отпис|two[\s-]?step|2[\s-]?step|2fa|//help\.|/help\b|//support\.|/support\b"
                        r"|\.(png|jpe?g|gif|svg|css|ico)(\?|$)")

# Turns a stored email body into plain text, keeping line breaks
def html_to_text(body: str) -> str:
    body = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", " ", body)
    body = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|td|table|h\d)>", "\n", body)
    body = re.sub(r"<[^>]+>", " ", body)
    return html.unescape(body)

def _is_notification(subject: str, text: str) -> bool:
    content = f"{subject}\n{text}"
    if _PRICE_CHANGE.search(content):
        return True
    return not _ASKS_TO_CONFIRM.search(subject) and bool(_NOTIFICATION.search(content))

# The first match of the first pattern that matches, without the spaces and dashes inside
def _first_code(patterns: list, *sources):
    for pattern in patterns:
        for source in sources:
            match = pattern.search(source)
            if match:
                return re.sub(r"[ -]", "", match.group(1))
    return None

def _find_link(subject: str, body: str):
    action_subject = _ACTION_SUBJECT.search(subject)

    def wanted(text: str) -> bool:
        return bool(_CONFIRM_LINK.search(text) or (action_subject and _ACTION_LINK.search(text)))

    # buttons say what they do, while tracked addresses often say nothing
    for href, label in _ANCHOR.findall(body):
        url = html.unescape(href).strip()
        label = html_to_text(label)
        if url.lower().startswith(("http://", "https://")) and not _LINK_SKIP.search(url) and not _LINK_SKIP.search(label) and wanted(label):
            return url

    for url in _URL.findall(body):
        url = html.unescape(url).rstrip(".,;)")
        if not _LINK_SKIP.search(url) and wanted(url):
            return url

    return None

# Finds the one-time code in an email, or returns None
def extract_code(subject: str, body: str):
    subject = subject or ""
    body = body or ""
    text = html_to_text(body)

    code = _first_code(_SURE_PATTERNS, subject, text)
    if code:
        return code

    if _is_notification(subject, text):
        return None

    # this email asks to follow a link, so its numbers are something else (a zip code...)
    if _find_link(subject, body):
        return None

    code = _first_code(_SOFT_PATTERNS, subject, text)
    if code:
        return code

    match = _SUBJECT_NUMBER.search(subject) or _CODE_LINE.search(text) or _EMPHASIZED.search(body)
    if match:
        return match.group(1)

    # numbers inside links (ids, tracking) are not codes
    plain = _URL.sub(" ", text)
    numbers = {number for number in _LONE_NUMBER.findall(plain) if not _YEAR.fullmatch(number)}
    if len(numbers) == 1:
        number = next(iter(numbers))
        if _CODE_SUBJECT.search(subject) or (len(number) >= 6 and len(plain.strip()) <= SHORT_EMAIL_CHARS):
            return number

    return None

# Finds a verification / sign-in link in an email, or returns None
def extract_link(subject: str, body: str):
    subject = subject or ""
    body = body or ""

    if _is_notification(subject, html_to_text(body)):
        return None

    return _find_link(subject, body)
