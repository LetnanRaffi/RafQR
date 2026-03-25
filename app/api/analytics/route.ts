import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    const { type, fileId } = await request.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (type === 'visit') {
      // Track visitor
      const today = new Date().toISOString().split('T')[0];
      
      // Insert visit record
      await supabase.from('analytics_visits').insert({
        visit_date: today,
        visited_at: new Date().toISOString(),
      });

      // Get today's visitor count
      const { data: visitData } = await supabase
        .from('analytics_visits')
        .select('id', { count: 'exact', head: false })
        .eq('visit_date', today);

      return NextResponse.json({ 
        success: true, 
        visitors: visitData?.length || 0 
      });
    }

    if (type === 'transfer') {
      // Track transfer
      const today = new Date().toISOString().split('T')[0];
      
      await supabase.from('analytics_transfers').insert({
        transfer_date: today,
        file_id: fileId,
        transferred_at: new Date().toISOString(),
      });

      // Get total transfers
      const { count: totalCount } = await supabase
        .from('analytics_transfers')
        .select('*', { count: 'exact', head: true });

      // Get today's transfers
      const { count: todayCount } = await supabase
        .from('analytics_transfers')
        .select('*', { count: 'exact', head: true })
        .eq('transfer_date', today);

      return NextResponse.json({ 
        success: true, 
        total: totalCount || 0,
        today: todayCount || 0
      });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to track' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const today = new Date().toISOString().split('T')[0];

    // Get today's visitors
    const { count: visitorsToday } = await supabase
      .from('analytics_visits')
      .select('*', { count: 'exact', head: true })
      .eq('visit_date', today);

    // Get total transfers
    const { count: totalTransfers } = await supabase
      .from('analytics_transfers')
      .select('*', { count: 'exact', head: true });

    // Get today's transfers
    const { count: transfersToday } = await supabase
      .from('analytics_transfers')
      .select('*', { count: 'exact', head: true })
      .eq('transfer_date', today);

    return NextResponse.json({
      visitorsToday: visitorsToday || 0,
      totalTransfers: totalTransfers || 0,
      transfersToday: transfersToday || 0,
    });
  } catch (error) {
    console.error('Analytics fetch error:', error);
    return NextResponse.json({ 
      visitorsToday: 0,
      totalTransfers: 0,
      transfersToday: 0
    });
  }
}
