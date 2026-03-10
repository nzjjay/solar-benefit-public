// dailySim.js
// Client-side full 365-day hourly simulation using uploaded TMY and usage CSV data.

function parseTmyRows(rows) {
  // rows: array of objects with Month, Day, Hour, Tilted (W/m2)
  // Build map by date key 'M-D' with hours array
  const days = {};
  for (const r of rows) {
    const m = Number(r.Month);
    const d = Number(r.Day);
    const h = Number(r.Hour);
    const tilted = Number(r['Tilted Irr.'] || r.Tilted || r.tilted || r['Tilted'] || 0) || 0;
    const key = `${m}-${d}`;
    if (!days[key]) days[key] = { month: m, day: d, hours: {} };
    days[key].hours[h] = tilted;
  }
  // return ordered list of day entries (should be 365 or 366)
  const list = Object.values(days).sort((a,b) => (a.month - b.month) || (a.day - b.day));
  return list;
}

function parseUsageRows(rows) {
  // rows: array of objects with DATE, START TIME, END TIME, USAGE
  // We'll aggregate by month-day-hour: avgUsage[month][day][hour]
  console.log('parseUsageRows: processing', rows.length, 'rows');
  if (rows.length > 0) {
    console.log('First row keys:', Object.keys(rows[0]));
    console.log('First few rows:', rows.slice(0, 3));
  }
  
  const buckets = {};
  for (const r of rows) {
    const dateStr = r.DATE || r['DATE'] || r.Date || r.date;
    const start = r['START TIME'] || r['Start'] || r.start || '';
    const usage = Number(r.USAGE || r.Usage || r.usage || 0) || 0;
    
    if (!dateStr || !start || usage === 0) {
      continue;
    }
    
    // parse date day/month/year (format: DD/MM/YYYY)
    const parts = dateStr.split('/').map(s => s.trim());
    if (parts.length < 2) continue;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    
    // parse start hour (e.g., '7:30') -> hour int
    const st = (start || '').split(':');
    const hour = parseInt(st[0], 10);
    if (isNaN(day) || isNaN(month) || isNaN(hour) || day < 1 || month < 1 || hour < 0 || hour > 23) {
      continue;
    }
    
    if (!buckets[month]) buckets[month] = {};
    if (!buckets[month][day]) buckets[month][day] = {};
    if (!buckets[month][day][hour]) buckets[month][day][hour] = { sum: 0, count: 0 };
    buckets[month][day][hour].sum += usage;
    buckets[month][day][hour].count += 1;
  }
  
  console.log('Parsed usage buckets for months:', Object.keys(buckets));
  
  // compute totals (sum of 30-min intervals for each hour)
  const avg = {};
  let totalParsed = 0;
  for (const m in buckets) {
    avg[m] = {};
    for (const d in buckets[m]) {
      avg[m][d] = {};
      for (const h in buckets[m][d]) {
        const b = buckets[m][d][h];
        avg[m][d][h] = b.sum; // total kWh for the hour (sum of 30-min intervals)
        totalParsed += b.sum;
      }
    }
  }
  
  console.log('Total usage parsed:', totalParsed, 'kWh');
  return avg; // avg[month][day][hour]
}

export function runFullYearSimulation(tmyRows, usageRows, inputs) {
  // parse inputs
  const perfRatio = 0.80;
  const rtEff = 0.90;
  const chargeEff = Math.sqrt(rtEff);
  const dischargeEff = Math.sqrt(rtEff);
  const inverterKw = Number(inputs.inverterKw) || 9999;
  const systemKw = (Number(inputs.numPanels) * Number(inputs.panelWattage)) / 1000;
  const batteryEnabled = !!inputs.batteryEnabled;
  const batteryKwh = Number(inputs.batteryKwh) || 0;
  // Current provider rates (for baseline cost)
  const currentDayRate = Number(inputs.currentDayRate) || 0;
  const currentNightRate = Number(inputs.currentNightRate) || 0;
  const currentDailyFixed = Number(inputs.currentDailyFixedCharge) || 0;
  
  // Future provider rates (for solar cost)
  const futureDayRate = Number(inputs.futureDayRate) || 0;
  const futureNightRate = Number(inputs.futureNightRate) || 0;
  const futureDailyFixed = Number(inputs.futureDailyFixedCharge) || 0;
  const exportRate = Number(inputs.exportRate) || 0;
  const inflation = (Number(inputs.priceInflation) || 0) / 100;
  const installationCost = Number(inputs.installationCost) || 0;

  const tmyDays = parseTmyRows(tmyRows);
  let usageAvg;
  if (!usageRows) {
    // create synthetic usage based on annual inputs
    const dayDaily = (Number(inputs.annualDayUsage) || 0) / 365;
    const nightDaily = (Number(inputs.annualNightUsage) || 0) / 365;
    usageAvg = {};
    for (let m = 1; m <= 12; m++) {
      usageAvg[m] = {};
      for (let d = 1; d <= 31; d++) {
        usageAvg[m][d] = {};
        for (let h = 0; h < 24; h++) {
          const isDay = h >= 6 && h <= 18; // rough day hours 6am-6pm
          usageAvg[m][d][h] = isDay ? (dayDaily / 12) : (nightDaily / 12);
        }
      }
    }
  } else {
    usageAvg = parseUsageRows(usageRows);
  }

  // Build hourly sequence for 365 days based on tmyDays; if tmyDays length <365 it's okay
  const hourlySeries = [];
  for (const day of tmyDays) {
    for (let h = 0; h < 24; h++) {
      const tilted = day.hours[h] || 0;
      // attempt to get usage for that specific month/day/hour; fallback to month-hour average by averaging across days
      const m = day.month;
      const d = day.day;
      let usage = 0;
      if (usageAvg[m] && usageAvg[m][d] && usageAvg[m][d][h] != null) {
        usage = usageAvg[m][d][h];
      } else if (usageAvg[m]) {
        // fallback to average across days in month for that hour
        const hours = usageAvg[m];
        let sum = 0, count = 0;
        for (const dd in hours) {
          if (hours[dd] && hours[dd][h] != null) { 
            sum += hours[dd][h]; 
            count++; 
          }
        }
        usage = count ? (sum / count) : 0;
      }
      hourlySeries.push({ month: day.month, day: day.day, hour: h, tilted, usage });
    }
  }

  // simulate hourly over the series
  let soc = 0;
  const hoursOut = [];
  let annualGen=0, annualExport=0, annualGrid=0, annualSelf=0;
  let dayUsage = 0, nightUsage = 0;
  for (const h of hourlySeries) {
    const gen = Math.min(systemKw * (h.tilted / 1000) * perfRatio, inverterKw);
    annualGen += gen;
    let remaining = h.usage;
    const usedDirect = Math.min(gen, remaining);
    remaining -= usedDirect;
    let surplus = Math.max(0, gen - usedDirect);

    // charge battery from surplus (hourly)
    let charged=0, discharged=0, exported=0, gridBought=0;
    if (batteryEnabled && batteryKwh > 0 && surplus > 0) {
      // limit charge to battery remaining capacity and assume power limit equal to inverterKw
      const maxCharge = Math.min(inverterKw, surplus);
      const availCap = Math.max(0, batteryKwh - soc);
      const charge = Math.min(maxCharge, availCap);
      soc += charge * chargeEff;
      surplus -= charge;
      charged = charge;
    }
    if (surplus > 0) { exported = surplus; annualExport += surplus; surplus = 0; }

    if (batteryEnabled && batteryKwh > 0 && remaining > 0 && soc > 0) {
      const maxDischarge = Math.min(inverterKw, soc);
      const deliverable = maxDischarge * dischargeEff;
      const deliver = Math.min(deliverable, remaining);
      const preDischarge = deliver / dischargeEff;
      soc = Math.max(0, soc - preDischarge);
      remaining -= deliver;
      discharged = deliver;
      annualSelf += deliver;
    }

    if (remaining > 0) { gridBought = remaining; annualGrid += remaining; }
    annualSelf += usedDirect;

    // Count usage for day (7am-9pm) vs night (9pm-7am)
    if (h.hour >= 7 && h.hour < 21) {  // 7am to 8:59pm (day rate)
      dayUsage += h.usage;
    } else {  // 9pm to 6:59am (night rate)
      nightUsage += h.usage;
    }

    hoursOut.push({ ...h, gen, usedDirect, charged, discharged, exported, gridBought, soc });
  }

  // compute monthly aggregates for import/export chart
  const monthlyMap = {};
  for (const h of hoursOut) {
    const m = h.month;
    if (!monthlyMap[m]) monthlyMap[m] = { month: m, usage: 0, gridImport: 0, solarUsed: 0 };
    monthlyMap[m].usage += h.usage;
    monthlyMap[m].gridImport += h.gridBought;
    monthlyMap[m].solarUsed += (h.usedDirect + h.discharged);
  }
  const monthlyData = Object.values(monthlyMap).sort((a,b) => a.month - b.month);

  // compute daily aggregates from hoursOut grouping by month-day
  const daysMap = {};
  for (const h of hoursOut) {
    const key = `${h.month}-${h.day}`;
    if (!daysMap[key]) daysMap[key] = { month:h.month, day:h.day, gen:0, usage:0, export:0, grid:0, self:0 };
    daysMap[key].gen += h.gen;
    daysMap[key].usage += h.usage;
    daysMap[key].export += h.exported;
    daysMap[key].grid += h.gridBought;
    daysMap[key].self += (h.usedDirect + h.discharged);
  }
  const days = Object.values(daysMap).sort((a,b) => (a.month - b.month) || (a.day - b.day));

  // annual cost baseline (current provider) and with PV (future provider)
  // use day/night rates by hour: day 7am-9pm, night 9pm-7am
  let baselineEnergyCost = 0;
  let pvEnergyCost = 0;
  for (const h of hoursOut) {
    const isDay = h.hour >= 7 && h.hour < 21;  // 7am to 8:59pm = day rate
    
    // Baseline cost uses current provider rates
    const currentRate = isDay ? currentDayRate : currentNightRate;
    baselineEnergyCost += h.usage * currentRate;
    
    // PV cost uses future provider rates
    const futureRate = isDay ? futureDayRate : futureNightRate;
    pvEnergyCost += h.gridBought * futureRate;
    // exported gets credited at future provider export rate
    pvEnergyCost -= h.exported * exportRate;
  }
  baselineEnergyCost += currentDailyFixed * 365;
  pvEnergyCost += futureDailyFixed * 365;

  const annualSavings = baselineEnergyCost - pvEnergyCost;

  // 10-year projection with inflation
  const years = [];
  let cumulative = -installationCost; // Start with negative investment
  let paybackYear = null;
  for (let y=1;y<=10;y++){
    const multiplier = Math.pow(1+inflation, y-1);
    const savingsY = annualSavings * multiplier;
    const baselineCostY = baselineEnergyCost * multiplier;
    const solarCostY = pvEnergyCost * multiplier;
    cumulative += savingsY;
    if (paybackYear===null && cumulative >= 0) paybackYear = y;
    years.push({ 
      year: y, 
      baselineCost: baselineCostY,
      solarCost: solarCostY,
      savings: savingsY, 
      cumulativeSavings: cumulative 
    });
  }
  
  // If payback not found in 10 years, calculate it
  if (paybackYear === null) {
    paybackYear = Math.ceil(installationCost / annualSavings);
  }

  console.log('Simulation results:', {
    annualGen: annualGen.toFixed(1),
    annualExport: annualExport.toFixed(1), 
    annualGrid: annualGrid.toFixed(1),
    dayUsage: dayUsage.toFixed(1),
    nightUsage: nightUsage.toFixed(1),
    totalUsage: (dayUsage + nightUsage).toFixed(1)
  });

  return { hours: hoursOut, days, monthlyData, annualGen, annualExport, annualGrid, annualSelf, annualSavings, years, paybackYear, dayUsage, nightUsage };
}

export function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  
  // Check if this is a TMY file (has Month and Day) or usage file (has DATE)
  let headerIndex = -1;
  let isTmyFile = false;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Month') && lines[i].includes('Day')) {
      headerIndex = i;
      isTmyFile = true;
      break;
    } else if (lines[i].includes('DATE') && lines[i].includes('START TIME')) {
      headerIndex = i;
      isTmyFile = false;
      break;
    }
  }
  
  if (headerIndex === -1) {
    console.log('No valid header found in CSV. Looking for Month+Day or DATE+START TIME');
    return [];
  }
  
  const header = lines[headerIndex].split(/,|\t/).map(h => h.trim());
  console.log('Found header at line', headerIndex + 1, ':', header);
  
  const rows = [];
  const startDataIndex = isTmyFile ? headerIndex + 2 : headerIndex + 1; // TMY has units line, usage doesn't
  
  for (let i = startDataIndex; i < lines.length; i++) {
    const cols = lines[i].split(/,|\t/);
    if (cols.length < header.length) continue;
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = cols[j] ? cols[j].trim() : '';
    }
    rows.push(obj);
  }
  
  console.log('Parsed', rows.length, 'data rows from CSV');
  return rows;
}
