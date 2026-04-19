import { NextRequest, NextResponse } from 'next/server';
import { listProducts, getProduct, deleteProduct } from '@/lib/printify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/printify/products - List all products
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    
    const products = await listProducts(limit);
    return NextResponse.json({ products });
  } catch (error) {
    console.error('Failed to list products:', error);
    return NextResponse.json(
      { error: 'Failed to list products', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/printify/products - Delete a product
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('id');
    
    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    await deleteProduct(productId);
    return NextResponse.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Failed to delete product:', error);
    return NextResponse.json(
      { error: 'Failed to delete product', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
