import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST() {
  try {
    const pipelinePath = path.join(process.cwd(), 'python-pipeline');
    const venvPython = path.join(pipelinePath, 'venv', 'bin', 'python');
    
    // Check if venv exists, if not try using system python
    let pythonCmd = venvPython;
    try {
      const { execSync } = require('child_process');
      execSync(`test -f ${venvPython}`, { stdio: 'ignore' });
    } catch {
      // Venv doesn't exist, try system python
      pythonCmd = 'python3';
    }
    
    // Run fetch historical data
    console.log('Fetching historical data...');
    const fetchResult = await execAsync(`cd ${pipelinePath} && ${pythonCmd} fetch_historical_data.py`, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    });
    console.log('Fetch output:', fetchResult.stdout);
    if (fetchResult.stderr) console.error('Fetch errors:', fetchResult.stderr);
    
    // Run calculate snapshots
    console.log('Calculating snapshots...');
    const calcResult = await execAsync(`cd ${pipelinePath} && ${pythonCmd} calculate_snapshots.py`, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    });
    console.log('Calculate output:', calcResult.stdout);
    if (calcResult.stderr) console.error('Calculate errors:', calcResult.stderr);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Snapshots refreshed successfully',
      output: {
        fetch: fetchResult.stdout,
        calculate: calcResult.stdout
      }
    });
  } catch (error: any) {
    console.error('Error refreshing snapshots:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to refresh snapshots',
      details: error.stdout || error.stderr
    }, { status: 500 });
  }
}