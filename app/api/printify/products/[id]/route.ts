import { NextRequest, NextResponse } from 'next/server';
import { getProduct, updateProduct } from '@/lib/printify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/printify/products/[id] - Get a specific product
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const product = await getProduct(params.id);
    return NextResponse.json({ product });
  } catch (error) {
    console.error('Failed to get product:', error);
    return NextResponse.json(
      { error: 'Failed to get product', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/printify/products/[id] - Update a product
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const updates = await req.json();
    const product = await updateProduct(params.id, updates);
    return NextResponse.json({ product });
  } catch (error) {
    console.error('Failed to update product:', error);
    return NextResponse.json(
      { error: 'Failed to update product', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
