import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from '../../../lib/redis';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getIp = (req: Request): string =>
  req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  req.headers.get('x-real-ip') ||
  'unknown';

export async function POST(request: Request) {
  try {
    // Rate limit tracking writes: 60 / minute / IP
    if (!(await rateLimit(`analytics:${getIp(request)}`, 60, 60))) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
    }

    const { type, fileId, fileSize, fileName } = await request.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const today = new Date().toISOString().split('T')[0];

    if (type === 'visit') {
      await supabase.from('analytics_visits').insert({
        visit_date: today,
        visited_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true });
    }

    if (type === 'transfer') {
      await supabase.from('analytics_transfers').insert({
        transfer_date: today,
        file_id: fileId,
        file_size: fileSize || 0,
        file_name: fileName || 'unknown',
        transferred_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    // Admin-only: compare against a server-side secret (never NEXT_PUBLIC_).
    const adminSecret = process.env.ADMIN_SECRET;
    const provided = request.headers.get('x-admin-key');
    if (!adminSecret || provided !== adminSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Preferred: aggregate in SQL (bounded memory, scales with data volume).
    const { data: overview, error: rpcErr } = await supabase.rpc('get_analytics_overview');
    if (!rpcErr && overview) {
      return NextResponse.json({
        totalTransfers: overview.totalTransfers || 0,
        totalGb: (Number(overview.totalSizeBytes || 0) / (1024 * 1024 * 1024)).toFixed(3),
        largestFile: overview.largestFile || { file_size: 0, file_name: 'None' },
        chartData: overview.chartData || [],
        totalVisitors: overview.totalVisitors || 0,
      });
    }

    // Fallback (RPC not installed): compute in-app.
    // 1. Fetch all transfers
    const { data: allTransfers } = await supabase
      .from('analytics_transfers')
      .select('file_size, file_name, transfer_date');

    const totalCount = allTransfers?.length || 0;
    const totalSizeBytes = allTransfers?.reduce((acc, curr) => acc + (curr.file_size || 0), 0) || 0;
    
    // 2. Largest File
    const largestFile = (allTransfers || []).length > 0
      ? allTransfers!.reduce((prev, current) => (prev.file_size > current.file_size) ? prev : current)
      : { file_size: 0, file_name: 'None' };

    // 3. Weekly Stats (Last 7 days)
    const chartData = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const count = allTransfers?.filter(t => t.transfer_date === dateStr).length || 0;
        chartData.push({ date: dateStr, count });
    }
    chartData.reverse();

    // 4. Visitors
    const { count: totalVisitors } = await supabase
      .from('analytics_visits')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      totalTransfers: totalCount,
      totalGb: (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(3),
      largestFile,
      chartData,
      totalVisitors: totalVisitors || 0
    });
  } catch (error) {
    console.error('Analytics fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
