from __future__ import annotations
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "quiz_sources"
OUT = ROOT / "quizzes"
OUT.mkdir(parents=True, exist_ok=True)

SUPPORTED = {".txt", ".json", ".docx", ".pdf"}


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "quiz"


def read_source(path: Path):
    ext = path.suffix.lower()
    if ext == ".txt":
        return path.read_text(encoding="utf-8-sig")
    if ext == ".json":
        return json.loads(path.read_text(encoding="utf-8-sig"))
    if ext == ".docx":
        from docx import Document
        doc = Document(str(path))
        return "\n".join(p.text for p in doc.paragraphs)
    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    raise ValueError(f"Không hỗ trợ định dạng {ext}")


def to_duration_seconds(value, default=300):
    if value is None or value == "":
        return default
    try:
        n = float(value)
        # DURATION trong metadata được hiểu là số phút.
        return max(30, int(n * 60))
    except Exception:
        return default


def normalize_json(obj, fallback_title: str):
    title = str(obj.get("title") or fallback_title).strip()
    description = str(obj.get("description") or "").strip()
    subject = str(obj.get("subject") or "Trắc nghiệm").strip()
    icon = str(obj.get("icon") or "📝").strip()
    duration = obj.get("durationSeconds")
    if duration is None:
        duration = to_duration_seconds(obj.get("duration"), 300)
    else:
        duration = max(30, int(duration))

    questions = []
    for q in obj.get("questions", []):
        content = q.get("question") or q.get("content") or q.get("q")
        options = q.get("options") or q.get("o") or []
        correct = q.get("correct")
        if correct is None:
            correct = q.get("answer", q.get("a"))

        if isinstance(correct, str):
            c = correct.strip().upper()
            if re.fullmatch(r"[A-Z]", c):
                correct = ord(c) - ord("A")
            elif c.isdigit():
                correct = int(c)

        if content and isinstance(options, list) and len(options) >= 2 and isinstance(correct, int) and 0 <= correct < len(options):
            item = {
                "id": len(questions) + 1,
                "question": str(content).strip(),
                "options": [str(x).strip() for x in options],
                "correct": correct,
            }
            explanation = q.get("explain") or q.get("explanation")
            if explanation:
                item["explain"] = str(explanation).strip()
            questions.append(item)

    if not questions:
        raise ValueError("JSON không có câu hỏi hợp lệ.")

    return {
        "title": title,
        "description": description,
        "subject": subject,
        "icon": icon,
        "duration": duration,
        "questions": questions,
    }


def meta(text: str, key: str):
    m = re.search(rf"(?im)^\s*{re.escape(key)}\s*:\s*(.+?)\s*$", text)
    return m.group(1).strip() if m else ""


def parse_text(text: str, fallback_title: str):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    title = meta(text, "TITLE") or fallback_title
    description = meta(text, "DESCRIPTION")
    subject = meta(text, "SUBJECT") or "Trắc nghiệm"
    icon = meta(text, "ICON") or "📝"
    duration = to_duration_seconds(meta(text, "DURATION"), 300)

    markers = list(re.finditer(r"(?im)^\s*Câu\s*(\d+)\s*[:.\-]\s*(.+?)\s*$", text))
    questions = []

    for idx, marker in enumerate(markers):
        start = marker.end()
        end = markers[idx + 1].start() if idx + 1 < len(markers) else len(text)
        q_text = marker.group(2).strip()
        block = text[start:end]

        answer_match = re.search(
            r"(?im)^\s*(?:Đáp\s*án|Dap\s*an|Answer)\s*[:\-]\s*([A-Z])\s*$",
            block,
        )
        if not answer_match:
            continue

        answer_letter = answer_match.group(1).upper()
        option_matches = list(re.finditer(r"(?im)^\s*([A-Z])\s*[.)\-]\s*(.+?)\s*$", block))
        labels, options = [], []
        for om in option_matches:
            labels.append(om.group(1).upper())
            options.append(om.group(2).strip())

        if len(options) < 2 or answer_letter not in labels:
            continue

        item = {
            "id": len(questions) + 1,
            "question": q_text,
            "options": options,
            "correct": labels.index(answer_letter),
        }

        explain_match = re.search(
            r"(?im)^\s*(?:Giải\s*thích|Giai\s*thich|Explanation)\s*[:\-]\s*(.+?)\s*$",
            block,
        )
        if explain_match:
            item["explain"] = explain_match.group(1).strip()

        questions.append(item)

    if not questions:
        raise ValueError(
            "Không tìm thấy câu hỏi hợp lệ. Mẫu cần có 'Câu 1:', các lựa chọn 'A.', 'B.' và 'Đáp án: A'."
        )

    return {
        "title": title,
        "description": description,
        "subject": subject,
        "icon": icon,
        "duration": duration,
        "questions": questions,
    }


def build_one(path: Path):
    raw = read_source(path)
    fallback = path.stem.replace("-", " ").replace("_", " ").strip().title()

    if isinstance(raw, dict):
        quiz = normalize_json(raw, fallback)
    else:
        quiz = parse_text(raw, fallback)

    slug = slugify(path.stem)
    quiz["id"] = slug
    quiz["source"] = path.name
    quiz["questionCount"] = len(quiz["questions"])

    out_path = OUT / f"{slug}.json"
    out_path.write_text(json.dumps(quiz, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "id": slug,
        "title": quiz["title"],
        "description": quiz["description"],
        "subject": quiz["subject"],
        "icon": quiz["icon"],
        "duration": quiz["duration"],
        "questionCount": len(quiz["questions"]),
        "file": f"{slug}.json",
        "source": path.name,
    }


def main():
    SRC.mkdir(parents=True, exist_ok=True)

    for p in OUT.glob("*.json"):
        p.unlink()

    items, errors = [], []

    for path in sorted(SRC.iterdir()):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED:
            continue
        try:
            items.append(build_one(path))
            print(f"OK  {path.name}")
        except Exception as e:
            errors.append({"file": path.name, "error": str(e)})
            print(f"ERR {path.name}: {e}", file=sys.stderr)

    manifest = {"quizzes": items, "errors": errors}
    (OUT / "index.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Built {len(items)} quiz(es), {len(errors)} error(s).")
    # Không fail toàn bộ deploy chỉ vì 1 file đề bị lỗi.
    # Các file hợp lệ vẫn có thể sử dụng bình thường.


if __name__ == "__main__":
    main()
