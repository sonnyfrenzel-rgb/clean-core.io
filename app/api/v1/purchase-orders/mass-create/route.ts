import { NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    // F-20: demo/mock route — NOT a real SAP integration. Never served by a
    // production build: the ENABLE_MOCK_PO_ROUTE flag used to switch it on
    // there too, which contradicted this comment (QA full review of
    // fc787674705f, ba03296d851e). Outside production every answer is labelled
    // as a simulation, not as completed work.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { requisitionIds, companyCode } = body;

    if (!requisitionIds || !Array.isArray(requisitionIds) || requisitionIds.length === 0) {
      return NextResponse.json(
        { error: 'requisitionIds array is required' },
        { status: 400 }
      );
    }

    // Mock consolidation logic: if multiple PRs, they get the same PO ID for this demo
    const purchaseOrderId = `PO-${Math.floor(100000 + Math.random() * 900000)}`;
    const jobId = `JOB-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

    const results = requisitionIds.map(id => ({
      requisitionId: id,
      purchaseOrderId: purchaseOrderId,
      success: true,
      simulated: true,
      message: 'Simulated - no purchase order was created in any SAP system.'
    }));

    return NextResponse.json({
      jobId,
      status: 'SIMULATED',
      simulated: true,
      results
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
