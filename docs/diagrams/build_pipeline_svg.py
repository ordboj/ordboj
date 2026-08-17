#!/usr/bin/env python3
"""Generate docs/diagrams/pipeline.svg.

The diagram is a circle. The human sits in the center. The pipeline
stages sit on the ring, in clockwise order. Dashed amber spokes are the
points where an agent stops and asks the human.

Run: python3 docs/diagrams/build_pipeline_svg.py
"""

import math
from pathlib import Path

W, H = 1400, 1400
CX, CY = W / 2, H / 2
R = 470  # node ring radius

# palette
HUMAN = ("#FEF3C7", "#D97706", "#78350F")
AGENT = ("#DBEAFE", "#3B82F6", "#1E3A8A")
CRITIC = ("#FCE7F3", "#DB2777", "#831843")
STEP = ("#F1F5F9", "#94A3B8", "#334155")
GOOD = ("#DCFCE7", "#16A34A", "#14532D")
BAD = ("#E2E8F0", "#64748B", "#334155")
AMBER = "#D97706"
PINK = "#DB2777"
GREEN = "#16A34A"
INK = "#334155"
FONT = "font-family=\"-apple-system, 'Segoe UI', sans-serif\""


def pos(deg, r=R):
    a = math.radians(deg)
    return CX + r * math.sin(a), CY - r * math.cos(a)


out = []


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;")


def text(x, y, lines, color, size=15, weight=None, anchor="middle"):
    w = f' font-weight="{weight}"' if weight else ""
    t = [
        f'<text x="{x:.0f}" y="{y:.0f}" fill="{color}" font-size="{size}"'
        f' text-anchor="{anchor}" {FONT}{w}>'
    ]
    dy = -(len(lines) - 1) * size * 0.62
    for i, ln in enumerate(lines):
        t.append(
            f'<tspan x="{x:.0f}" dy="{size * 1.24 if i else dy:.0f}">{esc(ln)}</tspan>'
        )
    t.append("</text>")
    out.append("".join(t))


def person_icon(x, y, stroke, fill):
    out.append(
        f'<circle cx="{x:.0f}" cy="{y - 9:.0f}" r="9" fill="{fill}"'
        f' stroke="{stroke}" stroke-width="2"/>'
        f'<path d="M {x - 14:.0f} {y + 14:.0f} q 0 -13 14 -13 q 14 0 14 13 z"'
        f' fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
    )


def node(deg, lines, palette, w=176, h=64, shape="rect", person=False, r=R, bold_first=True):
    x, y = pos(deg, r)
    fill, stroke, fc = palette
    if shape == "diamond":
        pts = f"{x:.0f},{y - h / 2 - 8:.0f} {x + w / 2 - 18:.0f},{y:.0f} {x:.0f},{y + h / 2 + 8:.0f} {x - w / 2 + 18:.0f},{y:.0f}"
        out.append(
            f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
        )
    else:
        out.append(
            f'<rect x="{x - w / 2:.0f}" y="{y - h / 2:.0f}" width="{w}" height="{h}"'
            f' rx="12" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
        )
    if person:
        person_icon(x, y - h / 2 - 12, stroke, fill)
    if not lines:
        pass
    elif bold_first and len(lines) > 1:
        text(x, y - 8, [lines[0]], fc, 15, "bold")
        text(x, y + 12, lines[1:], fc, 13)
    else:
        text(x, y, lines, fc, 14, "bold" if bold_first else None)
    return x, y


def shrink(p1, p2, r1, r2):
    x1, y1 = p1
    x2, y2 = p2
    d = math.hypot(x2 - x1, y2 - y1) or 1
    ux, uy = (x2 - x1) / d, (y2 - y1) / d
    return (x1 + ux * r1, y1 + uy * r1), (x2 - ux * r2, y2 - uy * r2)


def arrow(p1, p2, color, dash=None, r1=48, r2=52, marker="m"):
    (x1, y1), (x2, y2) = shrink(p1, p2, r1, r2)
    d = f' stroke-dasharray="6 5"' if dash else ""
    out.append(
        f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}"'
        f' stroke="{color}" stroke-width="2"{d} marker-end="url(#{marker})"/>'
    )


def arc_arrow(deg1, deg2, color, r=R, dash=None, trim1=7, trim2=7, marker="m", width=2):
    a1, a2 = deg1 + trim1, deg2 - trim2
    x1, y1 = pos(a1, r)
    x2, y2 = pos(a2, r)
    d = f' stroke-dasharray="6 5"' if dash else ""
    out.append(
        f'<path d="M {x1:.0f} {y1:.0f} A {r:.0f} {r:.0f} 0 0 1 {x2:.0f} {y2:.0f}"'
        f' fill="none" stroke="{color}" stroke-width="{width}"{d} marker-end="url(#{marker})"/>'
    )


def band(deg1, deg2, r1, r2, fill, stroke):
    large = 1 if deg2 - deg1 > 180 else 0
    x1, y1 = pos(deg1, r2)
    x2, y2 = pos(deg2, r2)
    x3, y3 = pos(deg2, r1)
    x4, y4 = pos(deg1, r1)
    out.append(
        f'<path d="M {x1:.0f} {y1:.0f} A {r2} {r2} 0 {large} 1 {x2:.0f} {y2:.0f}'
        f' L {x3:.0f} {y3:.0f} A {r1} {r1} 0 {large} 0 {x4:.0f} {y4:.0f} Z"'
        f' fill="{fill}" stroke="{stroke}" stroke-width="1.5" opacity="0.6"/>'
    )


def spoke(deg, color, label_lines, inward, dash=True, r_out=R - 62, r_in=118, label_r=None):  # noqa: E501
    p_out, p_in = pos(deg, r_out), pos(deg, r_in)
    p1, p2 = (p_out, p_in) if inward else (p_in, p_out)
    d = ' stroke-dasharray="6 5"' if dash else ""
    out.append(
        f'<line x1="{p1[0]:.0f}" y1="{p1[1]:.0f}" x2="{p2[0]:.0f}" y2="{p2[1]:.0f}"'
        f' stroke="{color}" stroke-width="2"{d} marker-end="url(#ma)"/>'
    )
    lx, ly = pos(deg, label_r or (r_out + r_in) / 2)
    for i, ln in enumerate(label_lines):
        out.append(
            f'<text x="{lx:.0f}" y="{ly + i * 17 - (len(label_lines) - 1) * 8:.0f}" fill="{color}"'
            f' font-size="13" text-anchor="middle" {FONT}'
            f' paint-order="stroke" stroke="#FFFFFF" stroke-width="4">{esc(ln)}</text>'
        )


# ---- document ----
out.append(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" {FONT}>'
)
out.append(
    '<defs>'
    '<marker id="m" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"'
    ' markerHeight="7" orient="auto-start-reverse">'
    f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{INK}"/></marker>'
    '<marker id="ma" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"'
    ' markerHeight="7" orient="auto-start-reverse">'
    f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{AMBER}"/></marker>'
    '<marker id="mp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"'
    ' markerHeight="7" orient="auto-start-reverse">'
    f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{PINK}"/></marker>'
    '<marker id="mg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"'
    ' markerHeight="7" orient="auto-start-reverse">'
    f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{GREEN}"/></marker>'
    '</defs>'
)
out.append(f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>')

# phase bands behind the ring
band(-22, 100, R - 105, R + 115, "#EFF6FF", "#BFDBFE")
band(107, 288, R - 105, R + 115, "#F8FAFC", "#CBD5E1")
tx, ty = pos(39, R + 148)
text(tx, ty, ["1 · idea-pilot — is it worth building?"], "#1E3A8A", 17, "bold")
tx, ty = pos(238, R + 178)
text(tx, ty, ["2 · ticket-pilot — build it"], INK, 17, "bold")

# ring angles, clockwise from top
A = {
    "review": 0,
    "critic": 30,
    "verdict": 58,
    "staff": 86,
    "triage": 114,
    "impl": 141,
    "reviewer": 168,
    "risky": 195,
    "gate": 222,
    "ci": 250,
    "ready": 278,
    "lead": 306,
    "merged": 334,
}
P = {k: pos(v) for k, v in A.items()}

# ring flow (draw arcs under nodes)
seq = list(A)
labels = {
    ("verdict", "staff"): "pursue",
    ("reviewer", "risky"): "approved",
    ("risky", "gate"): "yes",
    ("gate", "ci"): "cleared",
    ("ci", "ready"): "green",
}
for a, b in zip(seq, seq[1:]):
    arc_arrow(A[a], A[b], INK, trim1=8, trim2=8)
    if (a, b) in labels:
        mx, my = pos((A[a] + A[b]) / 2, R + 26)
        text(mx, my, [labels[(a, b)]], "#64748B", 13)
# close the ring: merged -> review, the next idea
arc_arrow(A["merged"], A["review"] + 360, GREEN, dash=True, trim1=9, trim2=14, marker="mg")
mx, my = pos((A["merged"] + 360) / 2 - 6, R + 76)
text(mx, my, ["next idea 🔁"], GREEN, 14, "bold")
# risky -> ci on "no", inner arc that skips the gate
arc_arrow(A["risky"], A["ci"], INK, r=R - 88, trim1=10, trim2=10)
mx, my = pos(A["risky"] + 14, R - 118)
text(mx, my, ["no"], "#64748B", 13)

# rework loops, dashed pink, outside the ring
for a, b, lines in [
    ("critic", "review", ["contested,", "one rebuttal round"]),
    ("reviewer", "impl", ["rejected,", "max 2 rounds"]),
    ("ci", "impl", ["CI fails, remediate"]),
]:
    big = a == "ci"
    r_loop = R - 215 if big else R + 96
    r_edge = R - 58 if big else R + 44
    x1, y1 = pos(A[a] - (4 if big else 6), r_edge)
    x2, y2 = pos(A[b] + (8 if big else 6), (R - 80) if big else r_edge)
    xm, ym = pos((A[a] + A[b]) / 2, r_loop)
    out.append(
        f'<path d="M {x1:.0f} {y1:.0f} Q {xm:.0f} {ym:.0f} {x2:.0f} {y2:.0f}"'
        f' fill="none" stroke="{PINK}" stroke-width="2" stroke-dasharray="6 5"'
        f' marker-end="url(#mp)"/>'
    )
    lx, ly = pos((A[a] + A[b]) / 2 - 10, (r_loop + 6) if not big else (R - 158))
    for i, ln in enumerate(lines):
        out.append(
            f'<text x="{lx:.0f}" y="{ly + i * 16 - (len(lines) - 1) * 8:.0f}" fill="{PINK}"'
            f' font-size="13" text-anchor="middle" {FONT}'
            f' paint-order="stroke" stroke="#FFFFFF" stroke-width="4">{esc(ln)}</text>'
        )

# reject, radially outward from the verdict
rx, ry = pos(A["verdict"], R + 165)
arrow(pos(A["verdict"]), (rx, ry), "#64748B", dash=True, r1=52, r2=46)
out.append(
    f'<rect x="{rx - 60:.0f}" y="{ry - 22:.0f}" width="120" height="44" rx="20"'
    f' fill="{BAD[0]}" stroke="{BAD[1]}" stroke-width="2"/>'
)
text(rx, ry + 5, ["Rejected"], BAD[2], 14, "bold")
mx, my = pos(A["verdict"], R + 122)
text(mx - 10, my - 8, ["reject"], "#64748B", 13)

# spokes between the ring and the human
spoke(A["review"], AMBER, ["sends a raw", "idea 💡"], inward=False, dash=False, label_r=300, r_out=R - 86)
spoke(A["verdict"], AMBER, ["asks one precise", "question ❓"], inward=True, label_r=305)
spoke(A["gate"], AMBER, ["parks with one", "question"], inward=True, label_r=252)
spoke(A["ready"], AMBER, ["asks for merge", "approval"], inward=True, label_r=300)
spoke(A["lead"], AMBER, ["approves in", "the chat ✅"], inward=False, dash=False, label_r=300)

# ring nodes
node(A["review"], [], AGENT, w=214, h=132)
rvx, rvy = P["review"]
text(rvx, rvy - 44, ["blind value review"], AGENT[2], 14, "bold")
for i, nm in enumerate(["srs-engine", "swedish-linguist", "learning-designer", "ui-ux-expert"]):
    yy = rvy - 6 + (i // 2) * 46
    xx = rvx - 52 + (i % 2) * 104
    person_icon(xx, yy - 4, AGENT[1], AGENT[0])
    text(xx, yy + 24, [nm], AGENT[2], 10.5, "bold")
node(A["critic"], ["design-critic", "attacks weak arguments"], CRITIC, person=True)
node(A["verdict"], ["Verdict"], CRITIC, w=120, h=52, shape="diamond", bold_first=True)
node(A["staff"], ["staff-engineer", "cuts parallel-safe tickets"], AGENT, person=True)
node(A["triage"], ["triage the ticket"], STEP, w=150, h=48)
node(A["impl"], ["owning agent", "implements on a branch"], AGENT, person=True)
node(A["reviewer"], ["reviewer", "adversarial review"], CRITIC, person=True)
node(A["risky"], ["Risky change?"], CRITIC, w=150, h=54, shape="diamond")
node(A["gate"], ["owner-gate", "clears or parks risky changes"], CRITIC, w=196, person=True)
node(A["ci"], ["CI watch + repair"], STEP, w=160, h=48)
node(A["ready"], ["Ready to merge"], STEP, w=150, h=48)
node(A["lead"], ["lead session", "merges the PR"], AGENT, person=True)
node(A["merged"], ["Merged 🎉"], GOOD, w=130, h=50)

# the human, center of the loop
out.append(
    f'<circle cx="{CX}" cy="{CY}" r="96" fill="{HUMAN[0]}" stroke="{HUMAN[1]}"'
    ' stroke-width="3"/>'
)
out.append(
    f'<circle cx="{CX}" cy="{CY - 34:.0f}" r="22" fill="#FFFFFF" stroke="{HUMAN[1]}"'
    ' stroke-width="2.5"/>'
    f'<path d="M {CX - 36:.0f} {CY + 22:.0f} q 0 -32 36 -32 q 36 0 36 32 z"'
    f' fill="#FFFFFF" stroke="{HUMAN[1]}" stroke-width="2.5"/>'
)
text(CX, CY + 48, ["Human"], HUMAN[2], 18, "bold")
text(CX, CY + 70, ["in the loop"], HUMAN[2], 13)

out.append("</svg>")

Path(__file__).with_name("pipeline.svg").write_text("\n".join(out), encoding="utf-8")
print("wrote pipeline.svg")
