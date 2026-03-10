import React, { useEffect, useState } from 'react';
import { calculateProjection } from './calc';
import { saveInputs, loadInputs, clearInputs } from './storage';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { runFullYearSimulation, parseCSVText } from './dailySim';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

const DEFAULTS = {
  installationCost: 8000,
  // Current Provider
  currentDailyFixedCharge: 1.2,
  currentDayRate: 0.35,
  currentNightRate: 0.20,
  // Future Provider (with solar)
  futureDailyFixedCharge: 1.0,
  futureDayRate: 0.30,
  futureNightRate: 0.18,
  exportRate: 0.05,
  priceInflation: 3,
  batteryEnabled: false,
  batteryKwh: 10,
  inverterKw: 5,
  numPanels: 16,
  panelWattage: 370,
  annualDayUsage: 2000, // kWh annually
  annualNightUsage: 1500, // kWh annually
};

function NumberField({ label, value, onChange, step = 'any', min, suffix }) {
  return (
    <label style={{display: 'block', marginBottom: 8}}>
      <div style={{fontSize: 14, marginBottom: 4}}>{label}</div>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        style={{padding: '6px 8px', width: 80}}
      /> {suffix}
    </label>
  );
}

export default function App() {
  const [inputs, setInputs] = useState(() => ({ ...DEFAULTS }));
  const [projection, setProjection] = useState(null);
  const [tmyFile, setTmyFile] = useState(null);
  const [usageFile, setUsageFile] = useState(null);
  const [useClientFiles, setUseClientFiles] = useState(true);

  useEffect(() => {
    const saved = loadInputs();
    if (saved) setInputs(saved);
  }, []);

  const update = (patch) => setInputs(i => ({ ...i, ...patch }));

  const handleCalculate = async () => {
    if (useClientFiles && tmyFile) {
      try {
        const tmyText = await tmyFile.text();
        const tmyRows = parseCSVText(tmyText);
        let usageRows = null;
        if (usageFile) {
          const usageText = await usageFile.text();
          usageRows = parseCSVText(usageText);
        }
        const sim = runFullYearSimulation(tmyRows, usageRows, inputs);
        setProjection({ years: sim.years, totalSavings: sim.years.reduce((s,y)=>s+(y.savings||0),0), paybackYear: sim.paybackYear, summary: { annualGen: sim.annualGen, annualExport: sim.annualExport, annualGrid: sim.annualGrid, annualSelf: sim.annualSelf }, monthlyData: sim.monthlyData, dayUsage: sim.dayUsage, nightUsage: sim.nightUsage });
        saveInputs(inputs);
        return;
      } catch (err) {
        console.error('file read error', err);
      }
    }

    // fallback to generic projection without files
    const result = calculateProjection(inputs, 10);
    setProjection(result);
    saveInputs(inputs);
  };

  const handleReset = () => {
    clearInputs();
    setInputs({ ...DEFAULTS });
    setProjection(null);
  };

  return (
    <div style={{fontFamily: 'system-ui, sans-serif', padding: 20, maxWidth: 1000}}>
      <h1>Solar Benefit Calculator</h1>

      <div style={{display: 'flex', gap: 24}}>
        <div style={{flex: '0 0 420px', background: '#fff', padding: 16, borderRadius: 6}}>
          <h2 style={{marginTop: 0}}>Inputs</h2>

          <NumberField label="Installation cost" value={inputs.installationCost} onChange={v => update({ installationCost: v })} suffix="" />
          <NumberField label="Annual price inflation (%)" value={inputs.priceInflation} onChange={v => update({ priceInflation: v })} suffix="%" />

          <table style={{width: '100%', marginBottom: 16, borderCollapse: 'collapse', fontSize: 15}}>
            <thead>
              <tr>
                <th style={{padding: '8px', borderBottom: '2px solid #eee', width: '50%'}}></th>
                <th style={{padding: '8px', borderBottom: '2px solid #eee'}}>Current Provider<br/><span style={{fontWeight:400, fontSize:13}}>No Solar</span></th>
                <th style={{padding: '8px', borderBottom: '2px solid #eee'}}>Future Provider<br/><span style={{fontWeight:400, fontSize:13}}>With Solar</span></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{padding: '8px', fontWeight: '600'}}>Daily fixed charge</td>
                <td style={{padding: '8px'}}>
                  <NumberField value={inputs.currentDailyFixedCharge} onChange={v => update({ currentDailyFixedCharge: v })}/>
                </td>
                <td style={{padding: '8px'}}>
                  <NumberField value={inputs.futureDailyFixedCharge} onChange={v => update({ futureDailyFixedCharge: v })} />
                </td>
              </tr>
              <tr>
                <td style={{padding: '8px', fontWeight: '600'}}>Day rate (per kWh)</td>
                <td style={{padding: '8px'}}>
                  <NumberField value={inputs.currentDayRate} onChange={v => update({ currentDayRate: v })} />
                </td>
                <td style={{padding: '8px'}}>
                  <NumberField value={inputs.futureDayRate} onChange={v => update({ futureDayRate: v })} />
                </td>
              </tr>
              <tr>
                <td style={{padding: '8px', fontWeight: '600'}}>Night rate (per kWh)</td>
                <td style={{padding: '8px'}}>
                  <NumberField value={inputs.currentNightRate} onChange={v => update({ currentNightRate: v })} />
                </td>
                <td style={{padding: '8px'}}>
                  <NumberField value={inputs.futureNightRate} onChange={v => update({ futureNightRate: v })} />
                </td>
              </tr>
              <tr>
                <td style={{padding: '8px', fontWeight: '600'}}>Export rate (per kWh)</td>
                <td style={{padding: '8px', color: '#aaa'}}>—</td>
                <td style={{padding: '8px'}}>
                  <NumberField value={inputs.exportRate} onChange={v => update({ exportRate: v })}/>
                </td>
              </tr>
            </tbody>
          </table>


          <div style={{height: 8}} />

          <label style={{display: 'block', marginBottom: 8}}>
            <input type="checkbox" checked={inputs.batteryEnabled} onChange={e => update({ batteryEnabled: e.target.checked })} />{' '}
            Enable battery
          </label>
          {inputs.batteryEnabled && (
            <NumberField label="Battery kWh (usable)" value={inputs.batteryKwh} onChange={v => update({ batteryKwh: v })} suffix="kWh" />
          )}

          <NumberField label="Hybrid inverter kW (max)" value={inputs.inverterKw} onChange={v => update({ inverterKw: v })} suffix="kW" />
          <NumberField label="Number of panels" value={inputs.numPanels} onChange={v => update({ numPanels: v })} />
          <NumberField label="Panel wattage" value={inputs.panelWattage} onChange={v => update({ panelWattage: v })} suffix="W" />

          <div style={{height: 8}} />

          <div style={{marginTop:12}}>
            <label>
              <a href="https://solarview.niwa.co.nz/" target="_blank" rel="noopener noreferrer" style={{textDecoration:'underline',color:'#0077cc'}}>Upload NIWA SolarView TMY CSV</a>: 
              <input type="file" accept=".csv" onChange={e=>setTmyFile(e.target.files[0])} />
            </label>
          </div>
          <div style={{marginTop:8}}>
            <label>Upload electricity usage CSV: <input type="file" accept=".csv" onChange={e=>setUsageFile(e.target.files[0])} /></label>
          </div>
          <div style={{marginTop:8}}>
            <label><input type="checkbox" checked={useClientFiles} onChange={e=>setUseClientFiles(e.target.checked)} /> Run simulation with uploaded files (client-side)</label>
          </div>

          {!usageFile && (
            <div style={{marginTop: 12}}>
              <NumberField label="Annual day usage (kWh)" value={inputs.annualDayUsage} onChange={v => update({ annualDayUsage: v })} suffix="kWh" />
              <NumberField label="Annual night usage (kWh)" value={inputs.annualNightUsage} onChange={v => update({ annualNightUsage: v })} suffix="kWh" />
            </div>
          )}

          <div style={{marginTop: 12}}>
            <button onClick={handleCalculate} style={{padding: '8px 12px', marginRight: 8}}>Calculate</button>
            <button onClick={handleReset} style={{padding: '8px 12px'}}>Reset</button>
          </div>
        </div>

        <div style={{flex: 1}}>
          <h2 style={{marginTop: 0}}>Results</h2>
          {!projection && (
            <div style={{background: '#fff', padding: 16, borderRadius: 6}}>No results yet. Click Calculate to generate a 10-year projection.</div>
          )}

          {projection && (
            <div style={{background: '#fff', padding: 16, borderRadius: 6}}>
              <div style={{display: 'flex', gap: 20, marginBottom: 12}}>
                <div style={{flex: 1, minWidth: 300}}>
                  <h3 style={{margin: '0 0 8px'}}>Monthly Energy Mix</h3>
                  <Bar
                    data={{
                      labels: projection.monthlyData ? projection.monthlyData.map(m => {
                        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                        return months[m.month - 1];
                      }) : [],
                      datasets: [
                        {
                          label: 'Solar Used (kWh)',
                          data: projection.monthlyData ? projection.monthlyData.map(m => Math.round(m.solarUsed)) : [],
                          backgroundColor: 'rgba(255, 193, 7, 0.8)'
                        },
                        {
                          label: 'Grid Import (kWh)', 
                          data: projection.monthlyData ? projection.monthlyData.map(m => Math.round(m.gridImport)) : [],
                          backgroundColor: 'rgba(220, 53, 69, 0.8)'
                        }
                      ]
                    }}
                    options={{
                      responsive: true, 
                      scales: { x: { stacked: true }, y: { stacked: true } },
                      plugins: { legend: { display: true } }
                    }}
                  />
                </div>

                <div style={{flex: 1, minWidth: 300}}>
                  <h3 style={{margin: '0 0 8px'}}>Cumulative savings</h3>
                  <Line
                    data={{
                      labels: projection.years ? projection.years.map(y => `Y${y.year}`) : [],
                      datasets: [{
                        label: 'Cumulative savings',
                        data: projection.years ? projection.years.map(y => Math.round(y.cumulativeSavings || y.cumulative || 0)) : [],
                        borderColor: 'rgba(75, 192, 192, 1)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.3,
                      }]
                    }}
                    options={{responsive: true, plugins: {legend: {display: false}}}}
                  />
                </div>
              </div>

              <div style={{display: 'flex', gap: 20, marginBottom: 12}}>
                <div>
                  <div style={{fontSize: 12, color: '#666'}}>Net benefit over 10 years</div>
                  <div style={{fontSize: 20, fontWeight: '600'}}>${((projection.totalSavings || 0) - inputs.installationCost).toFixed(2)}</div>
                </div>
                <div>
                  <div style={{fontSize: 12, color: '#666'}}>Payback period</div>
                  <div style={{fontSize: 20, fontWeight: '600'}}>{projection.paybackYear ? projection.paybackYear : 'Not within 10 years'}</div>
                </div>
              </div>

              <div style={{display: 'flex', gap: 20, marginBottom: 12}}>
                <div>
                  <div style={{fontSize: 12, color: '#666'}}>Annual generation</div>
                  <div style={{fontSize: 20, fontWeight: '600'}}>{projection.summary ? Math.round(projection.summary.annualGen) : '—'} kWh</div>
                </div>
                <div>
                  <div style={{fontSize: 12, color: '#666'}}>Annual export</div>
                  <div style={{fontSize: 20, fontWeight: '600'}}>{projection.summary ? Math.round(projection.summary.annualExport) : '—'} kWh</div>
                </div>
                <div>
                  <div style={{fontSize: 12, color: '#666'}}>Annual grid usage</div>
                  <div style={{fontSize: 20, fontWeight: '600'}}>{projection.summary ? Math.round(projection.summary.annualGrid) : '—'} kWh</div>
                </div>
              </div>

              <div style={{display: 'flex', gap: 20, marginBottom: 12}}>
                <div>
                  <div style={{fontSize: 12, color: '#666'}}>Total annual usage</div>
                  <div style={{fontSize: 20, fontWeight: '600'}}>
                    {projection.dayUsage != null && projection.nightUsage != null
                      ? (projection.dayUsage + projection.nightUsage).toFixed(1)
                      : '—'} kWh
                  </div>
                </div>
                <div>
                  <div style={{fontSize: 12, color: '#666'}}>Annual day usage (7am-9pm)</div>
                  <div style={{fontSize: 20, fontWeight: '600'}}>{projection.dayUsage ? projection.dayUsage.toFixed(1) : '—'} kWh</div>
                </div>
                <div>
                  <div style={{fontSize: 12, color: '#666'}}>Annual night usage (9pm-7am)</div>
                  <div style={{fontSize: 20, fontWeight: '600'}}>{projection.nightUsage ? projection.nightUsage.toFixed(1) : '—'} kWh</div>
                </div>
              </div>

              <div style={{maxHeight: 360, overflow: 'auto', borderTop: '1px solid #eee', paddingTop: 12}}>
                <table style={{width: '100%', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{textAlign: 'left'}}>
                      <th style={{padding: '6px 8px', borderBottom: '1px solid #eee'}}>Year</th>
                      <th style={{padding: '6px 8px', borderBottom: '1px solid #eee'}}>Cost (No Solar)</th>
                      <th style={{padding: '6px 8px', borderBottom: '1px solid #eee'}}>Cost (With Solar)</th>
                      <th style={{padding: '6px 8px', borderBottom: '1px solid #eee'}}>Annual Savings</th>
                      <th style={{padding: '6px 8px', borderBottom: '1px solid #eee'}}>Cumulative Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(projection.years || []).map(y => (
                      <tr key={y.year}>
                        <td style={{padding: '8px'}}>{y.year}</td>
                        <td style={{padding: '8px'}}>${(y.baselineCost || 0).toFixed(2)}</td>
                        <td style={{padding: '8px'}}>${(y.solarCost || 0).toFixed(2)}</td>
                        <td style={{padding: '8px'}}>${(y.savings || 0).toFixed(2)}</td>
                        <td style={{padding: '8px', color: (y.cumulativeSavings || 0) >= 0 ? 'green' : 'red'}}>
                          ${(y.cumulativeSavings || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Assumptions & Logic Table */}
          <div style={{background: '#fff', padding: 16, borderRadius: 6, marginTop: 16}}>
            <h3 style={{marginTop: 0}}>Assumptions & Logic</h3>
            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 14}}>
              <thead>
                <tr style={{textAlign: 'left'}}>
                  <th style={{padding: '8px', borderBottom: '2px solid #eee', width: '30%'}}>Category</th>
                  <th style={{padding: '8px', borderBottom: '2px solid #eee'}}>Assumption/Logic</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee', fontWeight: '600'}}>Energy Consumption Priority</td>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee'}}>
                    1. Solar power used first (direct consumption)<br/>
                    2. Battery power used second<br/>
                    3. Grid power used last
                  </td>
                </tr>
                <tr>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee', fontWeight: '600'}}>Excess Energy Priority</td>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee'}}>
                    1. Charge battery first (if enabled and capacity available)<br/>
                    2. Export remainder to grid at export rate
                  </td>
                </tr>
                <tr>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee', fontWeight: '600'}}>Solar Generation</td>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee'}}>
                    Based on NIWA TMY "Tilted Irr." data with 80% performance ratio<br/>
                    Limited by inverter capacity (kW rating)
                  </td>
                </tr>
                <tr>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee', fontWeight: '600'}}>Battery Efficiency</td>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee'}}>
                    90% round-trip efficiency (95% charge × 95% discharge)<br/>
                    Power limited by inverter capacity
                  </td>
                </tr>
                <tr>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee', fontWeight: '600'}}>Time-of-Use Rates</td>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee'}}>
                    Day rate: 7:00 AM - 9:00 PM<br/>
                    Night rate: 9:00 PM - 7:00 AM<br/>
                    Applied to both grid purchases and usage calculations
                  </td>
                </tr>
                <tr>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee', fontWeight: '600'}}>Provider Comparison</td>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee'}}>
                    Baseline cost uses current provider rates<br/>
                    Solar cost uses future provider rates (allowing provider switch)<br/>
                    Savings = Current provider cost - Future provider cost with solar
                  </td>
                </tr>
                <tr>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee', fontWeight: '600'}}>Daily Fixed Charges</td>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee'}}>
                    Current provider fixed charge applied to baseline scenario<br/>
                    Future provider fixed charge applied to solar scenario<br/>
                    Both increase annually by inflation rate
                  </td>
                </tr>
                <tr>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee', fontWeight: '600'}}>Price Inflation</td>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee'}}>
                    Same inflation rate applied to both provider rates and fixed charges<br/>
                    Export rate remains constant (no inflation)
                  </td>
                </tr>
                <tr>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee', fontWeight: '600'}}>Usage Data</td>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee'}}>
                    30-minute intervals summed to hourly consumption<br/>
                    If no usage file: annual estimates divided by time periods
                  </td>
                </tr>
                <tr>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee', fontWeight: '600'}}>Payback Calculation</td>
                  <td style={{padding: '8px', borderBottom: '1px solid #eee'}}>
                    Cumulative savings start at negative installation cost<br/>
                    Payback achieved when cumulative savings become positive
                  </td>
                </tr>
                <tr>
                  <td style={{padding: '8px', fontWeight: '600'}}>Simulation Period</td>
                  <td style={{padding: '8px'}}>
                    Hourly simulation over 365 days using TMY weather data<br/>
                    10-year financial projection with compounding inflation
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
