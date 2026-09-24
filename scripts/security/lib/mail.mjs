import { createHash } from 'node:crypto';
import { wrapEmailDocument } from './mail-shell.mjs';

/**
 * The CISO report as the owner reads it: German, condensed, every finding with
 * its location and evidence, and a proof block that ties the mail to the exact
 * commit, run and sealed artifact it came from.
 *
 * Everything the model wrote is escaped before it becomes HTML — a mail client
 * renders markup, and the report quotes code.
 */

/**
 * Who the sealed audit mail goes to. A function, not a constant, and read from
 * the environment rather than written down here: this file is in a public
 * repository. It must stay lazy — `tests/security-audit-guard.spec.ts` imports
 * this module to check other exports, and a throw at import time would fail that
 * test for a missing secret instead of for a real defect.
 */
export function recipient() {
  const value = process.env.REPORT_RECIPIENT;
  if (!value) {
    throw new Error(
      'REPORT_RECIPIENT is not set, so the audit report has nowhere to go. ' +
        'In CI: `gh secret set REPORT_RECIPIENT` and pass it into the job env.',
    );
  }
  return value;
}
export const FROM = 'Clean-Core.io Security <info@clean-core.io>';

const ORDER = ['kritisch', 'hoch', 'mittel', 'niedrig', 'info'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const where = (f) => (f.locations || []).map((l) => `${l.file}:${l.line}`).join(', ') || '—';

export function fingerprint(finding) {
  const file = finding.locations?.[0]?.file || '';
  return createHash('sha256').update(`${file}|${String(finding.title).toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim()}`).digest('hex').slice(0, 12);
}

export function numbered(payload) {
  const findings = [...(payload.report?.findings || [])].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  return findings.map((f, i) => ({ ...f, id: `SEC-${payload.head.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`, fingerprint: fingerprint(f) }));
}

export function counts(findings) {
  return Object.fromEntries(ORDER.map((s) => [s, findings.filter((f) => f.severity === s).length]));
}

/**
 * How much of what the consultants reported the CISO verified at the code.
 *
 * The release audit of v2.18.0 (81810c8, run 35998405111) verified none of 194
 * candidates — its one CISO call ran out of input before any code — and the
 * subject read "Risiko niedrig: 0 kritisch · 0 hoch …". Since 24.09.2026 the
 * sealed payload counts the candidates and names every one that was not
 * verified; when any remain, the headline says so instead of a rating.
 * Null for a payload from before that date, which carries no count.
 */
export function verificationState(payload) {
  const v = payload?.verification;
  if (!v) return null;
  const notVerified = v.notVerified || [];
  return { candidates: v.candidates ?? 0, verified: v.verified ?? 0, notVerified, complete: notVerified.length === 0 };
}

/** The reason a candidate was not verified, in German — the payload keeps the closed-list English form. */
export function reasonDe(reason) {
  const text = String(reason || '');
  if (/cost cap/.test(text)) return 'außerhalb des Budgets';
  if (/call limit/.test(text)) return 'außerhalb der Höchstzahl an Prüfaufrufen';
  const failed = /verification call failed \(([a-z0-9-]+)\)/.exec(text);
  if (failed) return `Prüfaufruf fehlgeschlagen (${failed[1]})`;
  if (/after redaction/.test(text)) return 'Eingabe nach der Schwärzung über der Grenze';
  return text;
}

/**
 * What the failed model calls cost the report, each kind named for what it lost.
 *
 * A failed consultant call leaves files unread; a failed verification call
 * leaves candidates unverified. The sealed total used to be described as the
 * first alone — "ihre Dateien stehen oben als nicht gründlich gelesen" — also
 * for a verification call, which read no file (QA review of 839c5dfdb6c4,
 * 4b3bfd34f4b6). A payload from before the split carries only the total and is
 * shown without an attribution it cannot support.
 */
export function failedCallParts(payload) {
  const consultant = payload?.consultantFailedCalls;
  if (typeof consultant !== 'number') return payload?.failedCalls ? [`${payload.failedCalls} fehlgeschlagen`] : [];
  const verification = Number(payload?.verification?.failedCalls) || 0;
  return [
    ...(consultant ? [`${consultant} Berater-Aufruf(e) fehlgeschlagen — ihre Dateien stehen oben als nicht gründlich gelesen`] : []),
    ...(verification ? [`${verification} Prüfaufruf(e) fehlgeschlagen — ihre Kandidaten stehen unter „Nicht verifiziert"`] : []),
  ];
}

export function renderAuditMail(payload, { version, runUrl, sealedSha256 }) {
  const r = payload.report;
  const findings = numbered(payload);
  const c = counts(findings);
  const v = verificationState(payload);
  const incomplete = Boolean(v && !v.complete);
  const tag = payload.selfTest ? '[SELBSTTEST] ' : '';
  const tally = `${c.kritisch} kritisch · ${c.hoch} hoch · ${c.mittel} mittel · ${c.niedrig} niedrig`;
  // Unverified candidates remain: the headline is how much was verified, never a rating of the verified part alone.
  const subject = incomplete
    ? `${tag}Security-Audit ${version} (${payload.head.slice(0, 7)}) — nicht vollständig geprüft: ${v.verified} von ${v.candidates} Kandidaten verifiziert, ${v.notVerified.length} nicht · ${tally}`
    : `${tag}Security-Audit ${version} (${payload.head.slice(0, 7)}) — Risiko ${r.risk_rating}: ${tally}`;
  const open = v?.notVerified || [];
  const cost = typeof payload.costUsd === 'number' ? `${payload.costUsd.toFixed(2)} $` : 'unbekannt';
  const minutes = Math.round((payload.durationMs || 0) / 60_000);
  const failed = failedCallParts(payload);

  const text = [
    subject,
    '',
    payload.selfTest ? 'SELBSTTEST der Audit-Kette an zwei Dateien mit kleinem Budget. Kein Audit-Ergebnis — geprüft wird, dass Analyse, Siegel und Zustellung funktionieren.\n' : '',
    ...(v
      ? [
          'PRÜFSTAND',
          incomplete
            ? `  Nicht vollständig geprüft: ${v.verified} von ${v.candidates} Kandidaten am Code verifiziert, ${open.length} nicht. Die Einstufung „${r.risk_rating}" gilt nur für den verifizierten Teil.`
            : `  Alle ${v.candidates} Kandidaten am Code verifiziert.`,
          '',
        ]
      : []),
    'KURZFAZIT',
    r.executive_summary,
    '',
    'BEFUNDE',
    ...(findings.length
      ? findings.map((f) => `  ${f.id}  ${f.severity.toUpperCase().padEnd(8)} ${f.title} — ${where(f)}`)
      : [incomplete ? `  Keine verifizierten Befunde — ${open.length} Kandidaten sind nicht verifiziert (unten namentlich).` : '  Keine Befunde, die der Prüfung standgehalten haben.']),
    '',
    ...findings.flatMap((f) => [
      `— ${f.id} · ${f.severity} · ${f.category}`,
      `  ${f.title}`,
      `  Fundstelle: ${where(f)}`,
      `  Beschreibung: ${f.description}`,
      `  Voraussetzung: ${f.preconditions}`,
      `  Auswirkung: ${f.impact}`,
      `  Beleg: ${f.evidence}`,
      `  Empfehlung: ${f.recommendation}`,
      `  Prüfen vor dem Fix: ${f.verification}`,
      `  Sicherheit der Einschätzung: ${Math.round((f.confidence || 0) * 100)} %`,
      '',
    ]),
    ...(open.length
      ? [
          `NICHT VERIFIZIERT (${open.length}) — Kandidaten der Berater, am Code nicht geprüft: weder Befund noch „kein Befund"`,
          ...open.map((n) => `  ${n.id}  ${String(n.severity).toUpperCase().padEnd(8)} (vorgeschlagen) ${n.title} — ${where(n)} — von ${(n.consultants || []).join(', ') || '—'} — ${reasonDe(n.reason)}`),
          '',
        ]
      : []),
    'HÄRTUNG',
    ...(r.hardening || []).map((h) => `  ${h.priority}  ${h.title} — ${h.rationale}`),
    '',
    'WAS GUT IST',
    ...(r.positive_observations || []).map((p) => `  + ${p}`),
    '',
    'UMFANG UND GRENZEN',
    `  ${r.coverage.files_in_scope} Dateien im Umfang · ${r.coverage.deep_read} gründlich gelesen · ${r.coverage.pattern_scanned_only} nur über Muster geprüft`,
    `  ${r.coverage.notes}`,
    ...(r.limitations || []).map((l) => `  – ${l}`),
    `  Modellaufrufe: ${payload.calls ?? '—'}${failed.length ? `, davon ${failed.join('; ')}` : ''}. Der Agent hat keine Werkzeuge: Er sieht nur, was die Pipeline ihm gibt.`,
    '',
    'NACHWEIS',
    `  Version ${version} · Commit ${payload.head}`,
    `  Lauf ${runUrl}`,
    `  Modell ${payload.model} · ${payload.calls ?? '—'} Aufrufe · ${minutes} min · ${cost}`,
    `  SHA-256 des versiegelten Berichts: ${sealedSha256}`,
    `  Nachprüfen: node scripts/security/inbox.mjs ${payload.head.slice(0, 12)} — öffnet dasselbe Artefakt mit dem privaten Schlüssel.`,
  ].join('\n');

  const html = wrapEmailDocument(renderHtmlBody({ payload, r, findings, c, v, version, runUrl, sealedSha256, cost, minutes, failed }), `Security-Audit ${version}`);
  return { subject, text, html, findings };
}

/** The project palette for severities — the same reds, ambers and slates the app and the other mails use. */
export const SEVERITY_STYLE = {
  kritisch: { fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  hoch: { fg: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  mittel: { fg: '#334155', bg: '#f1f5f9', border: '#e2e8f0' },
  niedrig: { fg: '#475569', bg: '#f8fafc', border: '#e2e8f0' },
  info: { fg: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
};

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const label = (text, colour = '#475569') => `<span style="font-weight: 800; color: ${colour}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 6px;">${text}</span>`;
const chip = (text, s) => `<span style="display: inline-block; font-size: 11px; font-weight: 800; color: ${s.fg}; background-color: ${s.bg}; border: 1px solid ${s.border}; padding: 3px 9px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.04em;">${text}</span>`;
const block = (title, body) => `<div style="margin-top: 12px;"><div style="font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 2px;">${title}</div><div style="font-size: 14px; color: #0f172a; line-height: 1.55;">${body}</div></div>`;

/**
 * Stacked everywhere — label above value, panels instead of tables — because the
 * Gmail app at 320px is where this gets read, and a table of file paths is what
 * forces a sideways scroll there (the same reasoning as lib/usage-report-email.ts).
 */
function renderHtmlBody({ payload, r, findings, c, v, version, runUrl, sealedSha256, cost, minutes, failed }) {
  const incomplete = Boolean(v && !v.complete);
  const open = v?.notVerified || [];
  const risk = incomplete ? SEVERITY_STYLE.hoch : SEVERITY_STYLE[r.risk_rating] || SEVERITY_STYLE.mittel;
  const tallyHtml = `<strong>${c.kritisch}</strong> kritisch &middot; <strong>${c.hoch}</strong> hoch &middot; <strong>${c.mittel}</strong> mittel &middot; <strong>${c.niedrig}</strong> niedrig${c.info ? ` &middot; <strong>${c.info}</strong> info` : ''}`;
  const unverified = (n) => `
      <div style="padding: 10px 0; border-bottom: 1px solid #eef2f6; overflow-wrap: anywhere; word-break: break-word;">
        <div>${chip(`${esc(n.severity)} &middot; vorgeschlagen`, SEVERITY_STYLE[n.severity] || SEVERITY_STYLE.info)} <span style="font-family: ${MONO}; font-size: 12px; color: #64748b; margin-left: 6px;">${esc(n.id)}</span></div>
        <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 4px; line-height: 1.35;">${esc(n.title)}</div>
        <div style="font-family: ${MONO}; font-size: 12px; color: #475569; margin-top: 2px; word-break: break-word;">${esc(where(n))}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">von ${esc((n.consultants || []).join(', ') || '—')} &middot; ${esc(reasonDe(n.reason))}</div>
      </div>`;
  const finding = (f) => {
    const s = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.info;
    return `
    <div class="panel" style="background-color: #ffffff; border: 1px solid ${s.border}; border-left: 4px solid ${s.fg}; border-radius: 16px; padding: 18px; margin-bottom: 14px; overflow-wrap: anywhere; word-break: break-word;">
      <div style="margin-bottom: 8px;">${chip(esc(f.severity), s)} <span style="font-family: ${MONO}; font-size: 12px; color: #64748b; margin-left: 6px;">${esc(f.id)}</span></div>
      <div style="font-size: 16px; font-weight: 800; color: #0f172a; line-height: 1.35;">${esc(f.title)}</div>
      <div style="font-family: ${MONO}; font-size: 12px; color: #475569; margin-top: 4px; word-break: break-word;">${esc(where(f))}</div>
      <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">${esc(f.category)} &middot; Sicherheit der Einschätzung ${Math.round((f.confidence || 0) * 100)}&thinsp;%</div>
      ${block('Beschreibung', esc(f.description))}
      ${block('Voraussetzung', esc(f.preconditions))}
      ${block('Auswirkung', esc(f.impact))}
      <div style="margin-top: 12px;"><div style="font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 4px;">Beleg</div>
        <pre style="margin: 0; background-color: #0f172a; color: #e2e8f0; border-radius: 10px; padding: 12px; font-family: ${MONO}; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">${esc(f.evidence)}</pre></div>
      ${block('Empfehlung', esc(f.recommendation))}
      ${block('Prüfen vor dem Fix', esc(f.verification))}
    </div>`;
  };

  return `
<div class="wrap" style="font-family: ${FONT}; max-width: 600px; margin: 0 auto; padding: 40px 24px; background-color: #f8fafc; color: #0f172a; overflow-wrap: anywhere; word-break: break-word;">

  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; height: 0; width: 0;">
    ${incomplete ? `Nicht vollständig geprüft: ${esc(v.verified)} von ${esc(v.candidates)} Kandidaten verifiziert, ${open.length} nicht` : `Risiko ${esc(r.risk_rating)}`}: ${c.kritisch} kritisch, ${c.hoch} hoch, ${c.mittel} mittel, ${c.niedrig} niedrig — ${esc(version)}.
  </div>

  <div class="card" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow: hidden; padding: 40px;">

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 28px; border-bottom: 1px solid #f1f5f9; padding-bottom: 22px;">
      <tr>
        <td class="brand-cell" align="left" valign="middle">
          <div style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; line-height: 1.2;">Clean-Core<span style="color: #10b981;">.io</span></div>
          <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em; margin-top: 4px;">Security-Audit${payload.selfTest ? ' &middot; Selbsttest' : ''}</div>
        </td>
        <td class="badge-cell" align="right" valign="middle" style="text-align: right;">
          <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #0f172a; background-color: #f1f5f9; padding: 6px 12px; border-radius: 8px; white-space: nowrap;">${esc(version)}</span>
        </td>
      </tr>
    </table>

    ${payload.selfTest ? `<div class="panel" style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 16px; padding: 16px; margin-bottom: 20px; font-size: 14px; color: #92400e; line-height: 1.5;"><strong>Selbsttest</strong> der Audit-Kette an zwei Dateien mit kleinem Budget. Kein Audit-Ergebnis &mdash; geprüft wird, dass Analyse, Siegel und Zustellung funktionieren.</div>` : ''}

    <div class="panel" style="background-color: ${risk.bg}; border: 1px solid ${risk.border}; border-radius: 16px; padding: 22px; margin-bottom: 24px;">
      ${incomplete
        ? `${label('Prüfstand', risk.fg)}
      <div style="font-size: 30px; font-weight: 800; color: ${risk.fg}; line-height: 1.1; margin-bottom: 10px;">Nicht vollständig geprüft</div>
      <div style="font-size: 14px; color: #334155; line-height: 1.6;"><strong>${esc(v.verified)}</strong> von <strong>${esc(v.candidates)}</strong> Kandidaten am Code verifiziert &middot; <strong>${open.length}</strong> nicht verifiziert</div>
      <div style="font-size: 14px; color: #334155; line-height: 1.6;">Verifiziert: ${tallyHtml}</div>
      <div style="font-size: 13px; color: #475569; line-height: 1.5; margin-top: 4px;">Einstufung nur des verifizierten Teils: ${esc(r.risk_rating)}</div>`
        : `${label('Gesamtrisiko', risk.fg)}
      <div style="font-size: 36px; font-weight: 800; color: ${risk.fg}; line-height: 1; margin-bottom: 10px; text-transform: capitalize;">${esc(r.risk_rating)}</div>
      <div style="font-size: 14px; color: #334155; line-height: 1.6;">
        ${tallyHtml}
      </div>`}
      <div style="font-family: ${MONO}; font-size: 12px; color: #64748b; margin-top: 6px; word-break: break-word;">Commit ${esc(payload.head.slice(0, 12))}</div>
    </div>

    ${label('Kurzfazit')}
    <p class="body-text" style="font-size: 15px; color: #0f172a; line-height: 1.6; margin: 0 0 26px 0;">${esc(r.executive_summary)}</p>

    ${label(`Befunde (${findings.length})`)}
    ${findings.length ? findings.map(finding).join('') : `<p style="font-size: 14px; color: #94a3b8; font-style: italic; margin: 0 0 20px 0;">${incomplete ? `Keine verifizierten Befunde &mdash; ${open.length} Kandidaten sind nicht verifiziert (unten namentlich).` : 'Keine Befunde, die der Prüfung standgehalten haben.'}</p>`}

    ${open.length ? `
    <div class="panel" style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 16px; padding: 18px; margin: 22px 0 18px 0;">
      ${label(`Nicht verifiziert (${open.length})`, '#92400e')}
      <div style="font-size: 13px; color: #92400e; line-height: 1.5; margin-bottom: 4px;">Kandidaten der Berater, am Code nicht geprüft &mdash; weder Befund noch &bdquo;kein Befund&ldquo;.</div>
      ${open.map(unverified).join('')}
    </div>` : ''}

    ${(r.hardening || []).length ? `
    <div class="panel" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; margin: 22px 0 18px 0;">
      ${label('Härtung')}
      ${r.hardening.map((h) => `<div style="padding: 9px 0; border-bottom: 1px solid #eef2f6;"><div>${chip(esc(h.priority), h.priority === 'P1' ? SEVERITY_STYLE.hoch : SEVERITY_STYLE.mittel)}</div><div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 4px;">${esc(h.title)}</div><div style="font-size: 13px; color: #475569; line-height: 1.5;">${esc(h.rationale)}</div></div>`).join('')}
    </div>` : ''}

    ${(r.positive_observations || []).length ? `
    <div class="panel" style="background-color: #f0fdf4; border: 1px solid #d1fae5; border-radius: 16px; padding: 18px; margin-bottom: 18px;">
      ${label('Was gut ist', '#065f46')}
      ${r.positive_observations.map((p) => `<div style="font-size: 14px; color: #065f46; line-height: 1.5; padding: 4px 0;">&#10003;&nbsp;${esc(p)}</div>`).join('')}
    </div>` : ''}

    <div class="panel" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; margin-bottom: 18px;">
      ${label('Umfang und Grenzen')}
      <div style="font-size: 14px; color: #0f172a; line-height: 1.6;"><strong>${esc(r.coverage.files_in_scope)}</strong> Dateien im Umfang &middot; <strong>${esc(r.coverage.deep_read)}</strong> gründlich gelesen &middot; <strong>${esc(r.coverage.pattern_scanned_only)}</strong> nur über Muster geprüft</div>
      <div style="font-size: 13px; color: #475569; line-height: 1.5; margin-top: 6px;">${esc(r.coverage.notes)}</div>
      ${(r.limitations || []).map((l) => `<div style="font-size: 13px; color: #475569; line-height: 1.5; padding-top: 4px;">&ndash;&nbsp;${esc(l)}</div>`).join('')}
      <div style="font-size: 13px; color: #475569; line-height: 1.5; padding-top: 6px;">Modellaufrufe: ${esc(payload.calls ?? '—')}${failed.length ? `, davon ${esc(failed.join('; '))}` : ''} &mdash; der Agent hat keine Werkzeuge und sieht nur, was die Pipeline ihm gibt.</div>
    </div>

    <div class="cta-wrap" style="text-align: center; margin: 26px 0;">
      <a class="cta" href="${esc(runUrl)}" style="display: inline-block; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Audit-Lauf öffnen</a>
    </div>

    <div style="border-top: 1px solid #f1f5f9; padding-top: 18px;">
      ${label('Nachweis', '#94a3b8')}
      <div style="font-family: ${MONO}; font-size: 11px; color: #64748b; line-height: 1.7; word-break: break-all;">
        Version ${esc(version)}<br>Commit ${esc(payload.head)}<br>Modell ${esc(payload.model)} &middot; ${esc(payload.calls ?? '—')} Aufrufe<br>Dauer ${minutes}&nbsp;min &middot; Kosten ${esc(cost)}<br>SHA-256 versiegelter Bericht ${esc(sealedSha256)}
      </div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-top: 8px;">Nachprüfen: <span style="font-family: ${MONO};">node scripts/security/inbox.mjs ${esc(payload.head.slice(0, 12))}</span> öffnet dasselbe Artefakt mit dem privaten Schlüssel.</div>
    </div>

  </div>

  <div class="footer" style="text-align: center; margin-top: 28px; padding: 0 16px; color: #94a3b8; font-size: 11px; line-height: 1.6;">
    Vertraulicher Sicherheitsbericht für den Administrator &middot; Clean-Core.io &middot; ${esc(version)}
  </div>
</div>`;
}
