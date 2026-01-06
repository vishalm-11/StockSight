import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST() {
  try {
    const pipelinePath = path.join(process.cwd(), '..', 'python-pipeline');
    const venvPython = path.join(pipelinePath, 'venv', 'bin', 'python');
    
    // Run fetch historical data
    console.log('Fetching historical data...');
    await execAsync(`cd ${pipelinePath} && ${venvPython} fetch_historical_data.py`);
    
    // Run calculate snapshots
    console.log('Calculating snapshots...');
    await execAsync(`cd ${pipelinePath} && ${venvPython} calculate_snapshots.py`);
    
    return NextResponse.json({ success: true, message: 'Snapshots refreshed successfully' });
  } catch (error) {
    console.error('Error refreshing snapshots:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to refresh snapshots' 
    }, { status: 500 });
  }
}