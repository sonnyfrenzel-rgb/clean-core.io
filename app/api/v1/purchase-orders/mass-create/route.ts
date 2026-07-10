import { NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    // F-20: demo/mock route — NOT a real SAP integration. Disabled in production so a
    // simulated "COMPLETED" success can never be mistaken for a live purchase-order
    // action. Enable in non-prod only via ENABLE_MOCK_PO_ROUTE=true.
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_MOCK_PO_ROUTE !== 'true') {
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
      message: 'Successfully processed'
    }));

    return NextResponse.json({
      jobId,
      status: 'COMPLETED',
      results
    }, { status: 201 });

  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
