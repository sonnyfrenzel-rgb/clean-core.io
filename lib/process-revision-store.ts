import { gzipSync, gunzipSync } from 'node:zlib';

/**
 * How a process revision's BPMN is kept in its Firestore document — server only.
 *
 * A Firestore document holds at most 1,048,576 bytes. The reconstruction of a
 * program with many branches can be several megabytes of BPMN (a 937-line
 * program gave 3.3 MB, mostly diagram coordinates), and writing it as plain
 * text failed with INVALID_ARGUMENT — the reader saw "run the analysis first"
 * for a program that had been analysed. BPMN is repetitive XML and compresses
 * about twentyfold, so a large model is stored gzip-compressed and base64
 * encoded in `xmlGzip`, with `xml` left empty. Small models stay plain text,
 * so every document written before this keeps reading as it always did.
 *
 * Everything that reads a revision document goes through `revisionDocData`,
 * which puts the BPMN back into `xml`; the digest (`xmlSha256`) is always of
 * the uncompressed text.
 */

/** Above this many bytes of BPMN the model is stored compressed. */
export const PLAIN_REVISION_XML_BYTES = 700_000;

/** The most a stored, compressed model may take — headroom below Firestore's 1 MiB for the other fields. */
export const MAX_STORED_REVISION_BYTES = 900_000;

export type StoredRevisionXml = { xml: string } | { xml: ''; xmlGzip: string };

/** The fields that carry the model, or null when even compressed it does not fit a document. */
export function storedRevisionXml(xml: string): StoredRevisionXml | null {
  if (Buffer.byteLength(xml, 'utf8') <= PLAIN_REVISION_XML_BYTES) return { xml };
  const xmlGzip = gzipSync(Buffer.from(xml, 'utf8'), { level: 9 }).toString('base64');
  if (xmlGzip.length > MAX_STORED_REVISION_BYTES) return null;
  return { xml: '', xmlGzip };
}

/** A revision document's data with the BPMN in `xml`, whichever way it was stored. */
export function revisionDocData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const doc = { ...(data || {}) };
  if (typeof doc.xmlGzip === 'string' && doc.xmlGzip !== '') {
    doc.xml = gunzipSync(Buffer.from(doc.xmlGzip, 'base64')).toString('utf8');
  }
  delete doc.xmlGzip;
  return doc;
}
