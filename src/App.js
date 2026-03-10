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
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 14, marginBottom: 4, fontWeight: '500', color: '#4b5563' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          style={{
            padding: '8px 12px',
            width: '100%',
            maxWidth: '120px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '15px'
          }}
        />
        {suffix && <span style={{ marginLeft: 8, color: '#6b7280' }}>{suffix}</span>}
      </div>
    </label>
  );
}

export default function App() {
  const [inputs, setInputs] = useState(() => ({ ...DEFAULTS }));
  const [projection, setProjection] = useState(null);
  const [tmyFile, setTmyFile] = useState(null);
  const [usageFile, setUsageFile] = useState(null);
  const [useClientFiles, setUseClientFiles] = useState(false);
  const [step, setStep] = useState(1);

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
        setProjection({ years: sim.years, totalSavings: sim.years.reduce((s, y) => s + (y.savings || 0), 0), paybackYear: sim.paybackYear, summary: { annualGen: sim.annualGen, annualExport: sim.annualExport, annualGrid: sim.annualGrid, annualSelf: sim.annualSelf }, monthlyData: sim.monthlyData, dayUsage: sim.dayUsage, nightUsage: sim.nightUsage });
        saveInputs(inputs);
        setStep(4); // Move to results step
        return;
      } catch (err) {
        console.error('file read error', err);
      }
    }

    // fallback to generic projection without files
    const result = calculateProjection(inputs, 10);
    setProjection(result);
    saveInputs(inputs);
    setStep(4); // Move to results step
  };

  const handleReset = () => {
    clearInputs();
    setInputs({ ...DEFAULTS });
    setProjection(null);
    setStep(1);
    setTmyFile(null);
    setUsageFile(null);
    setUseClientFiles(false);
  };

  const nextStep = () => setStep(s => Math.min(s + 1, 4));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', padding: 20, maxWidth: 900, margin: '0 auto', color: '#1f2937', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ color: '#111827', fontSize: '2.5rem', marginBottom: '8px' }}>Solar Benefit Calculator</h1>
        <p style={{ color: '#6b7280', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
          Discover if solar panels make financial sense for your home in this short step-by-step assessment.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '30px', flexWrap: 'wrap' }}>
        {[1, 2, 3, 4].map(num => (
          <div key={num} style={{
            padding: '8px 24px',
            borderRadius: '9999px',
            fontWeight: '600',
            backgroundColor: step === num ? '#3b82f6' : (step > num ? '#10b981' : '#e5e7eb'),
            color: step === num || step > num ? 'white' : '#6b7280',
            cursor: num <= Math.max(step, projection ? 4 : 1) ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
            onClick={() => {
              if (num <= Math.max(step, projection ? 4 : 1)) {
                setStep(num);
              }
            }}>
            {step > num ? '✓' : num}. {
              num === 1 ? 'System' :
                num === 2 ? 'Usage' :
                  num === 3 ? 'Rates' : 'Results'
            }
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>

        {/* Step 1: System Details */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 style={{ marginTop: 0, fontSize: '1.75rem', marginBottom: '8px' }}>Step 1. System Hardware</h2>
            <p style={{ color: '#6b7280', marginBottom: '24px' }}>Details about the solar system you want to install.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
              <NumberField label="Total Installation Cost" value={inputs.installationCost} onChange={v => update({ installationCost: v })} suffix="$ NZD" />
              <NumberField label="Number of panels" value={inputs.numPanels} onChange={v => update({ numPanels: v })} />
              <NumberField label="Panel wattage" value={inputs.panelWattage} onChange={v => update({ panelWattage: v })} suffix="W" />
              <NumberField label="Inverter capacity (Max)" value={inputs.inverterKw} onChange={v => update({ inverterKw: v })} suffix="kW" />
            </div>

            <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer', marginBottom: inputs.batteryEnabled ? '16px' : '0' }}>
                <input type="checkbox" checked={inputs.batteryEnabled} onChange={e => update({ batteryEnabled: e.target.checked })} style={{ marginRight: '12px', width: '20px', height: '20px' }} />
                Include a Home Battery (e.g., Tesla Powerwall)?
              </label>

              {inputs.batteryEnabled && (
                <div style={{ paddingLeft: '32px', borderLeft: '3px solid #3b82f6', marginLeft: '10px' }}>
                  <NumberField label="Battery Capacity (usable)" value={inputs.batteryKwh} onChange={v => update({ batteryKwh: v })} suffix="kWh" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Usage */}
        {step === 2 && (
          <div className="animate-fade-in">
            <h2 style={{ marginTop: 0, fontSize: '1.75rem', marginBottom: '8px' }}>Step 2. Power Consumption</h2>
            <p style={{ color: '#6b7280', marginBottom: '24px' }}>How much power do you normally use in a year?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                <div style={{ backgroundColor: '#fffbeb', padding: '16px', borderRadius: '8px', border: '1px solid #fef3c7' }}>
                  <h3 style={{ marginTop: 0, color: '#b45309' }}>Daytime Usage (7am - 9pm)</h3>
                  <NumberField label="Annual day usage" value={inputs.annualDayUsage} onChange={v => update({ annualDayUsage: v })} suffix="kWh / year" />
                  <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>Power consumed while the sun is up will be directly offset by your solar panels.</p>
                </div>

                <div style={{ backgroundColor: '#eff6ff', padding: '16px', borderRadius: '8px', border: '1px solid #dbeafe' }}>
                  <h3 style={{ marginTop: 0, color: '#1e3a8a' }}>Nighttime Usage (9pm - 7am)</h3>
                  <NumberField label="Annual night usage" value={inputs.annualNightUsage} onChange={v => update({ annualNightUsage: v })} suffix="kWh / year" />
                  <p style={{ fontSize: '13px', color: '#1e40af', margin: 0 }}>Power consumed at night relies on the grid, or a battery if you have one.</p>
                </div>
              </div>

              <div style={{ padding: '20px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0 }}>Advanced: Full Simulation Models (Optional)</h3>
                <p style={{ color: '#6b7280', fontSize: '14px' }}>For highly accurate hourly projections, you can upload specific historical data. Most users can skip this.</p>

                <label style={{ display: 'block', marginBottom: '16px', fontWeight: '500' }}>
                  <input type="checkbox" checked={useClientFiles} onChange={e => setUseClientFiles(e.target.checked)} style={{ marginRight: '8px' }} />
                  Enable custom CSV simulations
                </label>

                {useClientFiles && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '24px' }}>
                    <label style={{ fontSize: '14px' }}>
                      <div style={{ marginBottom: 4 }}>1. <a href="https://solarview.niwa.co.nz/" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>NIWA SolarView TMY weather CSV</a></div>
                      <input type="file" accept=".csv" onChange={e => setTmyFile(e.target.files[0])} />
                    </label>
                    <label style={{ fontSize: '14px' }}>
                      <div style={{ marginBottom: 4 }}>2. Half-hourly smart-meter usage CSV</div>
                      <input type="file" accept=".csv" onChange={e => setUsageFile(e.target.files[0])} />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Provider Rates */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h2 style={{ marginTop: 0, fontSize: '1.75rem', marginBottom: '8px' }}>Step 3. Electricity Pricing</h2>
            <p style={{ color: '#6b7280', marginBottom: '24px' }}>What do you currently pay, and what will you pay after installing solar?</p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px' }}>

              {/* Without Solar */}
              <div style={{ flex: '1 1 300px', backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <h3 style={{ marginTop: 0, paddingBottom: '12px', borderBottom: '1px solid #d1d5db' }}>Without Solar (Current)</h3>
                <NumberField label="Daily fixed charge" value={inputs.currentDailyFixedCharge} onChange={v => update({ currentDailyFixedCharge: v })} suffix="$ / day" />
                <NumberField label="Day rate (per kWh)" value={inputs.currentDayRate} onChange={v => update({ currentDayRate: v })} suffix="$ / kWh" />
                <NumberField label="Night rate (per kWh)" value={inputs.currentNightRate} onChange={v => update({ currentNightRate: v })} suffix="$ / kWh" />
              </div>

              {/* With Solar */}
              <div style={{ flex: '1 1 300px', backgroundColor: '#ecfdf5', padding: '20px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                <h3 style={{ marginTop: 0, paddingBottom: '12px', borderBottom: '1px solid #6ee7b7', color: '#065f46' }}>With Solar (Future)</h3>
                <NumberField label="Daily fixed charge" value={inputs.futureDailyFixedCharge} onChange={v => update({ futureDailyFixedCharge: v })} suffix="$ / day" />
                <NumberField label="Day rate (per kWh)" value={inputs.futureDayRate} onChange={v => update({ futureDayRate: v })} suffix="$ / kWh" />
                <NumberField label="Night rate (per kWh)" value={inputs.futureNightRate} onChange={v => update({ futureNightRate: v })} suffix="$ / kWh" />
                <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#d1fae5', borderRadius: '6px', border: '1px dashed #34d399' }}>
                  <NumberField label="Solar Buyback / Export Rate" value={inputs.exportRate} onChange={v => update({ exportRate: v })} suffix="$ / kWh" />
                  <p style={{ fontSize: '12px', color: '#047857', margin: 0 }}>What the grid pays you for unused solar power.</p>
                </div>
              </div>

            </div>

            <div style={{ marginTop: '24px' }}>
              <NumberField label="Expected Annual Price Inflation" value={inputs.priceInflation} onChange={v => update({ priceInflation: v })} suffix="%" />
            </div>

          </div>
        )}

        {/* Navigation Buttons for Wizard */}
        {step < 4 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
            {step > 1 ? (
              <button
                onClick={prevStep}
                style={{ padding: '12px 24px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#374151' }}
              >
                ← Back
              </button>
            ) : <div></div>}

            {step < 3 ? (
              <button
                onClick={nextStep}
                style={{ padding: '12px 32px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'white', fontSize: '1.1rem' }}
              >
                Next Step →
              </button>
            ) : (
              <button
                onClick={handleCalculate}
                style={{ padding: '12px 32px', backgroundColor: '#10b981', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'white', fontSize: '1.1rem', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.4)' }}
              >
                Calculate Projected Savings! ✨
              </button>
            )}
          </div>
        )}


        {/* Step 4: Results */}
        {step === 4 && projection && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '2rem' }}>Your Solar Projection</h2>
              <button onClick={handleReset} style={{ padding: '8px 16px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#4b5563' }}>
                Start Over
              </button>
            </div>

            {/* Hero Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              <div style={{ backgroundColor: '#eff6ff', padding: '24px', borderRadius: '12px', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', color: '#3b82f6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Benefit (10 Yrs)</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#1e3a8a', margin: '8px 0' }}>
                  ${((projection.totalSavings || 0) - inputs.installationCost).toFixed(0)}
                </div>
                <div style={{ fontSize: '13px', color: '#60a5fa' }}>Total savings minus installation cost</div>
              </div>
              <div style={{ backgroundColor: '#ecfdf5', padding: '24px', borderRadius: '12px', border: '1px solid #a7f3d0', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System Payback</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#065f46', margin: '8px 0' }}>
                  {projection.paybackYear ? `${projection.paybackYear} Years` : '10+ Years'}
                </div>
                <div style={{ fontSize: '13px', color: '#34d399' }}>Time to break even on investment</div>
              </div>
            </div>

            {/* Charts Section */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '32px', flexWrap: 'wrap' }}>

              <div style={{ flex: '1 1 400px', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ margin: '0 0 16px', color: '#374151', fontSize: '1.25rem' }}>Cumulative Financial Return</h3>
                <Line
                  data={{
                    labels: projection.years ? projection.years.map(y => `Year ${y.year}`) : [],
                    datasets: [{
                      label: 'Cumulative Savings ($)',
                      data: projection.years ? projection.years.map(y => Math.round(y.cumulativeSavings || y.cumulative || 0)) : [],
                      borderColor: '#10b981',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      borderWidth: 3,
                      fill: true,
                      tension: 0.4,
                      pointBackgroundColor: '#10b981',
                      pointRadius: 4,
                    }]
                  }}
                  options={{
                    responsive: true,
                    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                    scales: {
                      y: {
                        grid: { color: '#f3f4f6' },
                        border: { dash: [4, 4] },
                        ticks: { callback: (value) => '$' + value }
                      },
                      x: { grid: { display: false } }
                    }
                  }}
                />
              </div>

              {projection.monthlyData && (
                <div style={{ flex: '1 1 400px', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
                  <h3 style={{ margin: '0 0 16px', color: '#374151', fontSize: '1.25rem' }}>Monthly Energy Mix</h3>
                  <Bar
                    data={{
                      labels: projection.monthlyData.map(m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m.month - 1]),
                      datasets: [
                        { label: 'Solar Used (kWh)', data: projection.monthlyData.map(m => Math.round(m.solarUsed)), backgroundColor: '#fbbf24', borderRadius: 4 },
                        { label: 'Grid Import (kWh)', data: projection.monthlyData.map(m => Math.round(m.gridImport)), backgroundColor: '#9ca3af', borderRadius: 4 }
                      ]
                    }}
                    options={{
                      responsive: true,
                      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: '#f3f4f6' } } },
                      plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index' } }
                    }}
                  />
                </div>
              )}
            </div>

            {/* Generative Info */}
            <h3 style={{ fontSize: '1.25rem', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' }}>Annual Energy Breakdown</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', textTransform: 'uppercase' }}>Solar Generation</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>{projection.years && projection.years[0] ? Math.round(projection.years[0].generation || projection.summary?.annualGen || 0) : '—'} <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: 'normal' }}>kWh</span></div>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', textTransform: 'uppercase' }}>Solar Exported</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>{projection.years && projection.years[0] ? Math.round(projection.years[0].export || projection.summary?.annualExport || 0) : '—'} <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: 'normal' }}>kWh</span></div>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', textTransform: 'uppercase' }}>Grid Usage Needs</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
                  {projection.summary?.annualGrid ? Math.round(projection.summary.annualGrid) :
                    (Math.round(((inputs.annualDayUsage + inputs.annualNightUsage) - (projection.years?.[0]?.dayOffset || 0) - (projection.years?.[0]?.batteryOffset || 0))))} <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: 'normal' }}>kWh</span>
                </div>
              </div>
            </div>

            {/* Adjust Inputs Button */}
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button
                onClick={() => setStep(1)}
                style={{ padding: '10px 20px', backgroundColor: 'transparent', border: '2px solid #3b82f6', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#3b82f6' }}
              >
                ← Adjust Inputs & Recalculate
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
