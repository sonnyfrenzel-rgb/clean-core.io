import { wrapEmailDocument } from './email-layout';
import { APP_VERSION } from './version';
import type { UsageReport } from './usage-report';

/**
 * Renders the weekly admin usage report.
 *
 * German, because it goes to one person who reads German. Everything the report
 * says is in the mail itself — the point is a Friday glance on a phone, not a
 * prompt to go and log in. The deep link exists for when a number invites a
 * closer look, not as the place the information lives.
 *
 * The hero figure is the activation rate rather than consumption. Units used says
 * how busy the platform was; activation says whether it is being adopted, and that
 * is the question a weekly rhythm is meant to answer.
 */

const BASE_URL = 'https://clean-core.io';

const fmtDate = (d: Date) =>
  d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** ISO week number — how a German-speaking reader locates a week. */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** A delta the reader can judge at a glance, without doing the subtraction. */
function trend(current: number, previous: number): { text: string; colour: string } {
  const diff = current - previous;
  if (diff === 0) return { text: `± 0 zur Vorwoche`, colour: '#94a3b8' };
  if (diff > 0) return { text: `+${diff} zur Vorwoche`, colour: '#047857' };
  return { text: `${diff} zur Vorwoche`, colour: '#b45309' };
}

function metricRow(label: string, current: number, previous: number): string {
  const t = trend(current, previous);
  // Block layout, not a two-column row: at 320px a long German label and a right
  // aligned number collide, and Gmail's app is exactly where that shows. Stacked,
  // it reads the same at any width and needs no media query to do it.
  return `
    <div style="padding: 14px 0; border-bottom: 1px solid #f1f5f9;">
      <div style="font-size: 15px; color: #334155; font-weight: 600; line-height: 1.4; margin-bottom: 4px;">
        ${label}
      </div>
      <div>
        <span style="font-size: 26px; font-weight: 800; color: #0f172a; line-height: 1.1; vertical-align: middle;">${current}</span>
        <span style="font-size: 13px; font-weight: 700; color: ${t.colour}; margin-left: 10px; vertical-align: middle;">${t.text}</span>
      </div>
    </div>`;
}

/** Same reasoning as metricRow: label above value, never side by side. */
function totalRow(label: string, value: string, highlight = false): string {
  return `
    <div style="padding: 9px 0; border-bottom: 1px solid #eef2f6;">
      <div style="font-size: 13px; color: #64748b; line-height: 1.4;">${label}</div>
      <div style="font-size: 17px; font-weight: 800; color: ${highlight ? '#b45309' : '#0f172a'}; line-height: 1.3;">${value}</div>
    </div>`;
}

function personList(
  title: string,
  people: { name: string; email: string; suffix?: string }[],
  emptyText: string,
): string {
  const rows = people.length
    ? people
        .map(
          (p) => `
        <div style="padding: 9px 0; border-bottom: 1px solid #f1f5f9;">
          <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${p.name}${
            p.suffix ? ` <span style="font-weight: 600; color: #047857;">${p.suffix}</span>` : ''
          }</div>
          <div style="font-size: 13px; color: #64748b; word-break: break-word; line-height: 1.5;">${p.email}</div>
        </div>`,
        )
        .join('')
    : `<p style="font-size: 14px; color: #94a3b8; margin: 6px 0 0 0; font-style: italic; line-height: 1.5;">${emptyText}</p>`;

  return `
    <div class="panel" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; margin-bottom: 18px;">
      <span style="font-weight: 800; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 4px;">${title}</span>
      ${rows}
    </div>`;
}

export function renderUsageReportSubject(report: UsageReport): string {
  const kw = isoWeek(report.periodEnd);
  const { activated, accounts } = report.totals;
  return `Clean-Core.io Wochenbericht KW ${kw} — ${activated} von ${accounts} Accounts aktiv`;
}

export function renderUsageReportEmail(report: UsageReport): string {
  const { current, previous, totals } = report;
  const kw = isoWeek(report.periodEnd);
  const rate = totals.accounts ? Math.round((totals.activated / totals.accounts) * 100) : 0;
  const activationTrend = trend(current.activations, previous.activations);

  const body = `
<div class="wrap" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; background-color: #f8fafc; color: #0f172a;">

  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; height: 0; width: 0;">
    ${current.activations} Accounts erstmals aktiviert, ${current.runs} Analysen in KW ${kw}.
  </div>

  <div class="card" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow: hidden; padding: 40px;">

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 28px; border-bottom: 1px solid #f1f5f9; padding-bottom: 22px;">
      <tr>
        <td class="brand-cell" align="left" valign="middle">
          <div style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; line-height: 1.2;">
            Clean-Core<span style="color: #10b981;">.io</span>
          </div>
          <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em; margin-top: 4px;">
            Wochenbericht Nutzung
          </div>
        </td>
        <td class="badge-cell" align="right" valign="middle" style="text-align: right;">
          <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #0f172a; background-color: #f1f5f9; padding: 6px 12px; border-radius: 8px; white-space: nowrap;">
            KW ${kw}
          </span>
        </td>
      </tr>
    </table>

    <!-- Kernzahl: Adoption, nicht Verbrauch -->
    <div class="panel" style="background-color: #f0fdf4; border: 1px solid #d1fae5; border-radius: 16px; padding: 22px; margin-bottom: 26px;">
      <span style="font-size: 11px; font-weight: 800; color: #065f46; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 8px;">
        Aktivierungsquote
      </span>
      <div style="font-size: 40px; font-weight: 800; color: #065f46; line-height: 1; margin-bottom: 8px;">
        ${rate}&thinsp;%
      </div>
      <div style="font-size: 14px; color: #047857; line-height: 1.5;">
        <strong>${totals.activated} von ${totals.accounts}</strong> Accounts haben mindestens eine Analyse
        abgeschlossen. ${totals.neverStarted} haben noch nie eine gestartet.
      </div>
      <div style="font-size: 13px; font-weight: 700; color: ${activationTrend.colour}; margin-top: 10px;">
        ${current.activations} neu aktiviert diese Woche &middot; ${activationTrend.text}
      </div>
    </div>

    <!-- Woche gegen Vorwoche -->
    <p class="body-text" style="font-size: 13px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 6px 0;">
      Diese Woche
    </p>
    <p class="body-text" style="font-size: 12px; color: #94a3b8; margin: 0 0 10px 0;">
      ${fmtDate(report.periodStart)} bis ${fmtDate(report.periodEnd)}
    </p>
    <div style="margin-bottom: 26px;">
      ${metricRow('Neue Registrierungen', current.registrations, previous.registrations)}
      ${metricRow('Erstmals aktiviert', current.activations, previous.activations)}
      ${metricRow('Aktive Accounts', current.activeAccounts, previous.activeAccounts)}
      ${metricRow('Analysen durchgeführt', current.runs, previous.runs)}
      ${metricRow('Neue Projekte', current.projects, previous.projects)}
      ${metricRow('Verbrauchte Einheiten', current.units, previous.units)}
    </div>

    <!-- Bestand -->
    <div class="panel" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; margin-bottom: 18px;">
      <span style="font-weight: 800; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 12px;">Gesamtbestand</span>
      ${totalRow('Accounts (ohne Testkonten)', String(totals.accounts))}
      ${totalRow('Analysen insgesamt', String(totals.runsAllTime))}
      ${totalRow('Eindeutige ABAP-Objekte', String(totals.objectsAnalysed))}
      ${totalRow('Einheiten verbraucht', `${totals.unitsUsed} von ${totals.unitsGranted} vergebenen`)}
      ${totalRow('Accounts am Limit', String(totals.atLimit), totals.atLimit > 0)}
      ${totalRow('Noch nie gestartet', String(totals.neverStarted))}
      ${totalRow('Mit eigenem Gemini-Key (BYOK)', String(totals.byok))}
    </div>

    ${personList(
      'Neu registriert diese Woche',
      report.newAccounts.map((a) => ({ name: a.name, email: a.email })),
      'Keine neuen Registrierungen in dieser Woche.',
    )}

    ${personList(
      'Erstmals aktiviert diese Woche',
      report.newlyActivated.map((a) => ({
        name: a.name,
        email: a.email,
        suffix: `${a.runs} ${a.runs === 1 ? 'Analyse' : 'Analysen'}`,
      })),
      'Niemand hat diese Woche seine erste Analyse gestartet.',
    )}

    ${
      report.reachedLimit.length
        ? personList(
            'Kontingent aufgebraucht',
            report.reachedLimit,
            '',
          ) +
          `<p class="body-text" style="font-size: 12px; color: #94a3b8; margin: -8px 0 18px 0; line-height: 1.5;">
             Diese Accounts können ohne eigenen Gemini-Key nichts Neues analysieren — der wahrscheinlichste
             Zeitpunkt für ein Gespräch.
           </p>`
        : ''
    }

    <div class="cta-wrap" style="text-align: center; margin: 26px 0;">
      <a class="cta" href="${BASE_URL}/admin?tab=usage" style="display: inline-block; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
        Im Admin-Panel öffnen
      </a>
    </div>

    <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; font-size: 12px; color: #94a3b8; line-height: 1.6;">
      Automatisch erstellt am ${fmtDate(report.generatedAt)}. Testkonten aus der CI sind in allen Zahlen
      ausgenommen. Als Aktivität zählt eine abgeschlossene Analyse, nicht ein Login.
    </div>

  </div>

  <div class="footer" style="text-align: center; margin-top: 28px; padding: 0 16px; color: #94a3b8; font-size: 11px; line-height: 1.6;">
    Interner Bericht für Administratoren &middot; Clean-Core.io &middot; System-Version ${APP_VERSION}
  </div>
</div>`;

  return wrapEmailDocument(body, `Wochenbericht KW ${kw}`);
}

/** Plain-text alternative — a missing text part costs deliverability points. */
export function renderUsageReportText(report: UsageReport): string {
  const { current, previous, totals } = report;
  const kw = isoWeek(report.periodEnd);
  const rate = totals.accounts ? Math.round((totals.activated / totals.accounts) * 100) : 0;
  const line = (label: string, cur: number, prev: number) =>
    `  ${label.padEnd(28)}${String(cur).padStart(4)}   (${trend(cur, prev).text})`;

  return `CLEAN-CORE.IO — WOCHENBERICHT NUTZUNG, KW ${kw}
${fmtDate(report.periodStart)} bis ${fmtDate(report.periodEnd)}

AKTIVIERUNGSQUOTE: ${rate} %
${totals.activated} von ${totals.accounts} Accounts haben mindestens eine Analyse abgeschlossen.
${totals.neverStarted} haben noch nie eine gestartet.

DIESE WOCHE
${line('Neue Registrierungen', current.registrations, previous.registrations)}
${line('Erstmals aktiviert', current.activations, previous.activations)}
${line('Aktive Accounts', current.activeAccounts, previous.activeAccounts)}
${line('Analysen durchgefuehrt', current.runs, previous.runs)}
${line('Neue Projekte', current.projects, previous.projects)}
${line('Verbrauchte Einheiten', current.units, previous.units)}

GESAMTBESTAND
  Accounts (ohne Testkonten)  ${totals.accounts}
  Analysen insgesamt          ${totals.runsAllTime}
  Eindeutige ABAP-Objekte     ${totals.objectsAnalysed}
  Einheiten verbraucht        ${totals.unitsUsed} von ${totals.unitsGranted} vergebenen
  Noch nie gestartet          ${totals.neverStarted}
  Am Limit                    ${totals.atLimit}
  BYOK                        ${totals.byok}

NEU REGISTRIERT
${report.newAccounts.length ? report.newAccounts.map((a) => `  ${a.name} <${a.email}>`).join('\n') : '  (keine)'}

ERSTMALS AKTIVIERT
${report.newlyActivated.length ? report.newlyActivated.map((a) => `  ${a.name} <${a.email}> — ${a.runs} Analysen`).join('\n') : '  (niemand)'}

${report.reachedLimit.length ? `KONTINGENT AUFGEBRAUCHT\n${report.reachedLimit.map((a) => `  ${a.name} <${a.email}>`).join('\n')}\n` : ''}
Im Admin-Panel oeffnen: ${BASE_URL}/admin?tab=usage

Automatisch erstellt am ${fmtDate(report.generatedAt)}. Testkonten aus der CI sind
ausgenommen. Als Aktivitaet zaehlt eine abgeschlossene Analyse, nicht ein Login.
`;
}
