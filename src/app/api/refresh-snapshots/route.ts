import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

export async function POST() {
  try {
    const pipelinePath = path.join(process.cwd(), 'python-pipeline');
    const venvPython = path.join(pipelinePath, 'venv', 'bin', 'python');
    
    // Check if venv exists, if not try using system python
    let pythonCmd = 'python3';
    if (existsSync(venvPython)) {
      pythonCmd = venvPython;
      console.log('Using venv Python:', pythonCmd);
    } else {
      console.log('Venv not found, using system python3');
    }
    
    // Run fetch historical data
    console.log('Fetching historical data...');
    const fetchCommand = `cd "${pipelinePath}" && ${pythonCmd} fetch_historical_data.py`;
    console.log('Running:', fetchCommand);
    
    const fetchResult = await execAsync(fetchCommand, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      cwd: pipelinePath,
    });
    
    console.log('Fetch stdout:', fetchResult.stdout);
    if (fetchResult.stderr && fetchResult.stderr.trim()) {
      console.warn('Fetch stderr:', fetchResult.stderr);
    }
    
    // Run calculate snapshots
    console.log('Calculating snapshots...');
    const calcCommand = `cd "${pipelinePath}" && ${pythonCmd} calculate_snapshots.py`;
    console.log('Running:', calcCommand);
    
    const calcResult = await execAsync(calcCommand, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      cwd: pipelinePath,
    });
    
    console.log('Calculate stdout:', calcResult.stdout);
    if (calcResult.stderr && calcResult.stderr.trim()) {
      console.warn('Calculate stderr:', calcResult.stderr);
    }
    
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
    const errorMessage = error.message || 'Failed to refresh snapshots';
    const errorDetails = error.stdout || error.stderr || error.message;
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage,
      details: errorDetails
    }, { status: 500 });
  }
}