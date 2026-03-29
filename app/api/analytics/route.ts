import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
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

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
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
