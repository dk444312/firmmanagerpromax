import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { 
  BarChart3, Download, FileSpreadsheet, FileText, Calendar, 
  Printer, RefreshCw, Layers, Users, Briefcase, Award, 
  DollarSign, FileCode, CheckCircle2, AlertTriangle, Filter, Search, List
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Reports() {
  const { token } = useAuth();
  
  // Tab control
  const [activeTab, setActiveTab] = useState<'performance' | 'claims'>('performance');

  // Performance Tab Data
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Claims Tab Data
  const [claimsCases, setClaimsCases] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);

  // Claims Filter States
  const [filterClient, setFilterClient] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterCourt, setFilterCourt] = useState('');
  const [filterCaseType, setFilterCaseType] = useState('');
  const [filterAdvocate, setFilterAdvocate] = useState('');
  const [filterStatus, setFilterStatus] = useState('All'); // All, Active, Closed
  const [timeframePreset, setTimeframePreset] = useState<'all' | 'month' | 'quarter' | 'year' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch Performance Reports Data
  const fetchReportsData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch('/api/reports', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const payload = await res.json();
        setData(payload);
      } else {
        toast.error("Failed to compile performance reports");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error connecting to analytics engine");
    } finally {
      setLoading(false);
    }
  };

  // Fetch Institutional Claims Data
  const fetchClaimsData = async () => {
    if (!token) return;
    try {
      setClaimsLoading(true);
      const [casesRes, clientsRes, staffRes] = await Promise.all([
        fetch('/api/cases', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/clients', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/staff', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      if (casesRes.ok && clientsRes.ok && staffRes.ok) {
        setClaimsCases(await casesRes.json());
        setClients(await clientsRes.json());
        setStaff(await staffRes.json());
      } else {
        toast.error("Failed to retrieve claims database records");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error connecting to institutional reporting server");
    } finally {
      setClaimsLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsData();
    fetchClaimsData();
  }, [token]);

  // Export Performance CSV
  const handleExportCSV = (type: 'performance' | 'productivity' | 'cases') => {
    if (!data) return;
    
    let csvContent = "";
    let filename = "";

    if (type === 'performance') {
      csvContent = "Lawyer Name,Role,Assigned Cases,Completed Tasks,Hours Logged\n" +
        data.lawyerActivity.map((l: any) => `"${l.name}","${l.role}",${l.assignedCases},${l.completedTasks},${l.hoursTracked}`).join("\n");
      filename = "firm_lawyer_performance.csv";
    } else if (type === 'productivity') {
      csvContent = "Nature of Work,Hours Logged\n" +
        data.productivity.map((p: any) => `"${p.name}",${p.value}`).join("\n");
      filename = "hours_by_nature_of_work.csv";
    } else {
      csvContent = "Summary Metric,Value\n" +
        `"Total Opened Cases",${data.summary.totalCases}\n` +
        `"Active Cases",${data.summary.activeCases}\n` +
        `"Closed Cases",${data.summary.closedCases}\n` +
        `"Total Billable Hours",${data.summary.totalHours}\n` +
        `"Total Clients Active",${data.summary.totalClients}`;
      filename = "firm_summary_report.csv";
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filename} successfully!`);
  };

  const handlePrint = () => {
    window.print();
  };

  // Unique lists for Filters dropdowns
  const uniqueDepartments = useMemo(() => {
    const deps = claimsCases.map(c => c.department).filter(Boolean);
    return Array.from(new Set(deps));
  }, [claimsCases]);

  const uniqueCourts = useMemo(() => {
    const courts = claimsCases.map(c => c.court).filter(Boolean);
    return Array.from(new Set(courts));
  }, [claimsCases]);

  const uniqueCaseTypes = useMemo(() => {
    const types = claimsCases.map(c => c.case_type).filter(Boolean);
    return Array.from(new Set(types));
  }, [claimsCases]);

  // Filtering Logic for Institutional Claims Report (Requirement 21)
  const filteredClaimsCases = useMemo(() => {
    return claimsCases.filter((c) => {
      // 1. Status Filter
      const isClosed = c.status === 'Closed' || c.stage === 'Closed';
      if (filterStatus === 'Active' && isClosed) return false;
      if (filterStatus === 'Closed' && !isClosed) return false;

      // 2. Client Filter
      if (filterClient && c.client_id !== filterClient) return false;

      // 3. Department Filter
      if (filterDepartment && c.department !== filterDepartment) return false;

      // 4. Court Filter
      if (filterCourt && c.court !== filterCourt) return false;

      // 5. Case Type Filter
      if (filterCaseType && c.case_type !== filterCaseType) return false;

      // 6. Advocate Filter
      if (filterAdvocate) {
        const assignedIds = c.assigned_staff_ids || [];
        if (c.assigned_staff_id !== filterAdvocate && !assignedIds.includes(filterAdvocate)) return false;
      }

      // 7. Date Range / Timeframe Filter
      if (timeframePreset !== 'all') {
        const createDate = new Date(c.created_at || Date.now());
        const now = new Date();
        
        if (timeframePreset === 'month') {
          // current month
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          if (createDate < start) return false;
        } else if (timeframePreset === 'quarter') {
          // current quarter
          const currentQuarter = Math.floor(now.getMonth() / 3);
          const start = new Date(now.getFullYear(), currentQuarter * 3, 1);
          if (createDate < start) return false;
        } else if (timeframePreset === 'year') {
          // current year
          const start = new Date(now.getFullYear(), 0, 1);
          if (createDate < start) return false;
        } else if (timeframePreset === 'custom') {
          if (startDate && new Date(startDate) > createDate) return false;
          if (endDate) {
            const endLimit = new Date(endDate);
            endLimit.setHours(23, 59, 59, 999);
            if (createDate > endLimit) return false;
          }
        }
      }

      return true;
    });
  }, [claimsCases, filterClient, filterDepartment, filterCourt, filterCaseType, filterAdvocate, filterStatus, timeframePreset, startDate, endDate]);

  // Calculations for Totals (Requirement 21)
  const claimsTotals = useMemo(() => {
    let active = 0;
    let closed = 0;
    let potentialLossRaw = 0;
    let potentialExposureWeighted = 0;
    let estimatedFees = 0;

    filteredClaimsCases.forEach((c) => {
      const isClosed = c.status === 'Closed' || c.stage === 'Closed';
      if (isClosed) {
        closed++;
      } else {
        active++;
      }

      const pLoss = Number(c.potential_loss || 0);
      const likelihood = Number(c.likelihood_of_loss_gain || 0) / 100;
      const fees = Number(c.estimated_legal_fees || 0);

      potentialLossRaw += pLoss;
      potentialExposureWeighted += (pLoss * likelihood);
      estimatedFees += fees;
    });

    return {
      active,
      closed,
      potentialLossRaw,
      potentialExposureWeighted,
      estimatedFees
    };
  }, [filteredClaimsCases]);

  // Excel Export (.xls HTML stream)
  const handleExportClaimsExcel = () => {
    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Poppins', Arial, sans-serif; }
          h2 { color: #10b981; margin-bottom: 5px; }
          table { border-collapse: collapse; width: 100%; margin-top: 15px; }
          th { background-color: #10b981; color: white; padding: 12px; border: 1px solid #ddd; text-align: left; }
          td { padding: 10px; border: 1px solid #ddd; }
          .total-row { font-weight: bold; background-color: #f3f4f6; }
        </style>
      </head>
      <body>
        <h2>Outstanding Legal Claims Report</h2>
        <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Filters Applied:</strong> Status: ${filterStatus} | Timeframe: ${timeframePreset.toUpperCase()}</p>
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Name of Parties</th>
              <th>Case Number</th>
              <th>Nature of Claim</th>
              <th>Stage / Status</th>
              <th>Likelihood (%)</th>
              <th>Potential Loss</th>
              <th>Estimated Fees & Costs</th>
            </tr>
          </thead>
          <tbody>
            ${filteredClaimsCases.map((c, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${c.title}</td>
                <td>${c.case_number || 'N/A'}</td>
                <td>${c.case_type || c.description || 'N/A'}</td>
                <td>${c.stage || c.status || 'N/A'}</td>
                <td>${c.likelihood_of_loss_gain || 0}%</td>
                <td>$${Number(c.potential_loss || 0).toLocaleString()}</td>
                <td>$${Number(c.estimated_legal_fees || 0).toLocaleString()}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="4"><strong>GRAND TOTALS</strong></td>
              <td>Active: ${claimsTotals.active} | Closed: ${claimsTotals.closed}</td>
              <td>-</td>
              <td>Weighted Exposure: $${Math.round(claimsTotals.potentialExposureWeighted).toLocaleString()}</td>
              <td>Total Fees: $${Math.round(claimsTotals.estimatedFees).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `outstanding_claims_report_${new Date().toISOString().split('T')[0]}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel claims report compiled & downloaded!");
  };

  // Word Export (.doc HTML template)
  const handleExportClaimsWord = () => {
    const wordHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Poppins', Arial, sans-serif; padding: 40px; color: #1e293b; }
          h1 { color: #10b981; font-size: 26px; border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 20px; }
          .meta-info { margin-bottom: 25px; font-size: 13px; color: #64748b; line-height: 1.6; }
          .summary-card { background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
          .summary-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; color: #0f172a; }
          table { border-collapse: collapse; width: 100%; margin-top: 20px; }
          th { background-color: #f1f5f9; color: #0f172a; font-weight: bold; text-align: left; padding: 12px; border: 1px solid #cbd5e1; }
          td { padding: 12px; border: 1px solid #cbd5e1; font-size: 13px; color: #334155; }
          .total-row { font-weight: bold; background-color: #f1f5f9; }
        </style>
      </head>
      <body>
        <h1>OUTSTANDING LEGAL CLAIMS REPORT</h1>
        <div class="meta-info">
          <strong>Date Generated:</strong> ${new Date().toLocaleString()}<br/>
          <strong>Reporting Period:</strong> ${timeframePreset === 'all' ? 'ALL ARCHIVED MATTERS' : timeframePreset.toUpperCase()}<br/>
          <strong>Scope Filters:</strong> Status: ${filterStatus} | Case Type: ${filterCaseType || 'All'}<br/>
        </div>
        
        <div class="summary-card">
          <div class="summary-title">Executive Financial Summary Dashboard</div>
          <p><strong>Total Active Matters:</strong> ${claimsTotals.active}</p>
          <p><strong>Total Closed Matters:</strong> ${claimsTotals.closed}</p>
          <p><strong>Weighted Potential Financial Exposure:</strong> $${Math.round(claimsTotals.potentialExposureWeighted).toLocaleString()}</p>
          <p><strong>Total Estimated Legal Fees & Related Costs:</strong> $${Math.round(claimsTotals.estimatedFees).toLocaleString()}</p>
        </div>

        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Name of Parties</th>
              <th>Case Number</th>
              <th>Nature of Claim</th>
              <th>Stage / Status</th>
              <th>Likelihood (%)</th>
              <th>Potential Loss</th>
              <th>Estimated Fees</th>
            </tr>
          </thead>
          <tbody>
            ${filteredClaimsCases.map((c, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${c.title}</td>
                <td>${c.case_number || 'N/A'}</td>
                <td>${c.case_type || c.description || 'N/A'}</td>
                <td>${c.stage || c.status || 'N/A'}</td>
                <td>${c.likelihood_of_loss_gain || 0}%</td>
                <td>$${Number(c.potential_loss || 0).toLocaleString()}</td>
                <td>$${Number(c.estimated_legal_fees || 0).toLocaleString()}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="4">GRAND TOTALS</td>
              <td>Active: ${claimsTotals.active} | Closed: ${claimsTotals.closed}</td>
              <td>-</td>
              <td>Weighted Exposure: $${Math.round(claimsTotals.potentialExposureWeighted).toLocaleString()}</td>
              <td>Total Fees: $${Math.round(claimsTotals.estimatedFees).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([wordHtml], { type: 'application/msword;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `outstanding_claims_report_${new Date().toISOString().split('T')[0]}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Word report compiled & downloaded!");
  };

  // CSV Export for Claims
  const handleExportClaimsCSV = () => {
    const csvHeaders = ["No.", "Name of Parties", "Case Number", "Nature of Claim", "Stage/Status", "Likelihood (%)", "Potential Loss", "Estimated Fees"];
    const csvRows = filteredClaimsCases.map((c, i) => [
      i + 1,
      `"${c.title}"`,
      `"${c.case_number || 'N/A'}"`,
      `"${c.case_type || c.description || 'N/A'}"`,
      `"${c.stage || c.status || 'N/A'}"`,
      `"${c.likelihood_of_loss_gain || 0}%"`,
      `"${c.potential_loss || 0}"`,
      `"${c.estimated_legal_fees || 0}"`
    ]);
    
    // Totals row
    csvRows.push([
      "GRAND TOTALS",
      "",
      "",
      `"Active: ${claimsTotals.active} | Closed: ${claimsTotals.closed}"`,
      "",
      "",
      `"${Math.round(claimsTotals.potentialExposureWeighted)}"`,
      `"${Math.round(claimsTotals.estimatedFees)}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [csvHeaders.join(","), ...csvRows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `outstanding_claims_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV claims report downloaded!");
  };

  if (loading) {
    return (
      <div className="h-[80vh] w-full flex items-center justify-center font-poppins">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Compiling analytical metrics & aggregating hours...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-slate-400 font-poppins">
        <p>No analytical data could be retrieved. Try again later.</p>
        <button onClick={fetchReportsData} className="mt-4 bg-emerald-600 px-4 py-2 rounded text-white text-sm">Retry</button>
      </div>
    );
  }

  const { summary, courtBreakdown, productivity, lawyerActivity, upcomingHearings } = data;
  const maxCourtValue = Math.max(...courtBreakdown.map((c: any) => c.value), 1);
  const maxProductivityValue = Math.max(...productivity.map((p: any) => p.value), 1);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-poppins print:bg-white print:text-black">
      
      {/* Top Tab Swapper */}
      <div className="flex border-b border-white/5 pb-1 gap-2 print:hidden">
        <button
          onClick={() => setActiveTab('performance')}
          className={`px-5 py-3 text-sm font-semibold rounded-t-xl transition-all flex items-center gap-2 ${
            activeTab === 'performance'
              ? 'bg-[#151619] border-t-2 border-emerald-500 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          Performance & Analytics
        </button>
        <button
          onClick={() => setActiveTab('claims')}
          className={`px-5 py-3 text-sm font-semibold rounded-t-xl transition-all flex items-center gap-2 ${
            activeTab === 'claims'
              ? 'bg-[#151619] border-t-2 border-emerald-500 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileCode className="w-4 h-4 text-emerald-400" />
          Outstanding Legal Claims Report
        </button>
      </div>

      {/* ----------------- TAB 1: PERFORMANCE & ANALYTICS ----------------- */}
      {activeTab === 'performance' && (
        <div className="space-y-8 animate-fade-in">
          {/* Header Panel */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6 print:border-black print:pb-4">
            <div>
              <h1 className="text-3xl font-semibold text-white tracking-wide flex items-center gap-2 print:text-black">
                <BarChart3 className="w-8 h-8 text-emerald-500 print:text-emerald-600" />
                Performance & Analytics
              </h1>
              <p className="text-slate-400 text-sm mt-1 print:text-slate-700">Comprehensive diagnostic and performance review of legal matters, billable hours, and active lawyers.</p>
            </div>
            <div className="flex items-center gap-3 self-start print:hidden">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-[#1a1c20] hover:bg-[#26282d] text-slate-300 px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/5 transition-all"
              >
                <Printer className="w-4 h-4" /> Print / Save PDF
              </button>
              <div className="relative group">
                <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-950/20">
                  <Download className="w-4 h-4" /> Export Data
                </button>
                <div className="absolute right-0 mt-2 w-52 bg-[#151619] border border-white/10 rounded-xl shadow-2xl hidden group-hover:block z-50 overflow-hidden">
                  <button onClick={() => handleExportCSV('cases')} className="w-full text-left px-4 py-3 text-xs text-slate-300 hover:bg-[#26282d] hover:text-white flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Export Firm Summary (CSV)
                  </button>
                  <button onClick={() => handleExportCSV('performance')} className="w-full text-left px-4 py-3 text-xs text-slate-300 hover:bg-[#26282d] hover:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-500" /> Export Staff Performance (CSV)
                  </button>
                  <button onClick={() => handleExportCSV('productivity')} className="w-full text-left px-4 py-3 text-xs text-slate-300 hover:bg-[#26282d] hover:text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-500" /> Export Productivity logs (CSV)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* KPI Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-[#151619] rounded-2xl border border-white/5 p-6 shadow-xl relative overflow-hidden print:border-black print:bg-slate-100">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl"></div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Opened Matters</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-white print:text-black">{summary.totalCases}</span>
                <span className="text-xs text-slate-400 font-medium">all-time</span>
              </div>
              <div className="mt-4 flex items-center gap-4 text-xs">
                <span className="text-emerald-400 font-bold">{summary.activeCases} Active</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">{summary.closedCases} Closed</span>
              </div>
            </div>

            <div className="bg-[#151619] rounded-2xl border border-white/5 p-6 shadow-xl relative overflow-hidden print:border-black print:bg-slate-100">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl"></div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Hours Tracked</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-emerald-500 print:text-emerald-600">{summary.totalHours}</span>
                <span className="text-xs text-slate-400 font-medium">billable hrs</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-4">Calculated from legal stopwatch registers</span>
            </div>

            <div className="bg-[#151619] rounded-2xl border border-white/5 p-6 shadow-xl relative overflow-hidden print:border-black print:bg-slate-100">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl"></div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Clients Directory</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-white print:text-black">{summary.totalClients}</span>
                <span className="text-xs text-slate-400 font-medium">registered</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-4">Corporate & private client entities</span>
            </div>

            <div className="bg-[#151619] rounded-2xl border border-white/5 p-6 shadow-xl relative overflow-hidden print:border-black print:bg-slate-100">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl"></div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Upcoming Hearings</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-amber-500 print:text-amber-600">{summary.upcomingHearingsCount}</span>
                <span className="text-xs text-slate-400 font-medium">scheduled</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-4">Trials, chambers & conferences</span>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Productivity Hours by Nature of Work */}
            <div className="bg-[#151619] rounded-2xl border border-white/5 p-8 shadow-xl print:border-black print:bg-white">
              <h3 className="text-base font-semibold text-white tracking-wide mb-6 flex items-center gap-2 print:text-black">
                <Layers className="w-5 h-5 text-emerald-500" />
                Billable Hours by Nature of Work
              </h3>
              <div className="space-y-5">
                {productivity.map((p: any) => {
                  const percentage = Math.round((p.value / (summary.totalHours || 1)) * 100) || 0;
                  const barWidth = Math.max(Math.round((p.value / maxProductivityValue) * 100), 2);
                  return (
                    <div key={p.name} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-300 print:text-black">{p.name}</span>
                        <span className="text-slate-400 font-mono">
                          {p.value} hrs <span className="text-slate-600 font-bold">({percentage}%)</span>
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-[#0a0a0a] rounded-full overflow-hidden border border-white/5 print:border-black print:bg-slate-200">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-1000 print:bg-emerald-600" 
                          style={{ width: `${barWidth}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Court Distribution Breakdown */}
            <div className="bg-[#151619] rounded-2xl border border-white/5 p-8 shadow-xl print:border-black print:bg-white">
              <h3 className="text-base font-semibold text-white tracking-wide mb-6 flex items-center gap-2 print:text-black">
                <Briefcase className="w-5 h-5 text-blue-500" />
                Cases Registered per Court / Jurisdiction
              </h3>
              <div className="space-y-5">
                {courtBreakdown.length === 0 ? (
                  <div className="text-center text-slate-500 py-12 text-xs italic">No cases configured with court parameters.</div>
                ) : (
                  courtBreakdown.map((c: any) => {
                    const barWidth = Math.max(Math.round((c.value / maxCourtValue) * 100), 2);
                    return (
                      <div key={c.name} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-slate-300 print:text-black">{c.name}</span>
                          <span className="text-slate-400 font-mono font-bold">
                            {c.value} {c.value === 1 ? 'Matter' : 'Matters'}
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-[#0a0a0a] rounded-full overflow-hidden border border-white/5 print:border-black print:bg-slate-200">
                          <div 
                            className="h-full bg-blue-500 rounded-full transition-all duration-1000 print:bg-blue-600" 
                            style={{ width: `${barWidth}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Lawyers Performance Matrix */}
          <div className="bg-[#151619] rounded-2xl border border-white/5 shadow-xl p-8 print:border-black print:bg-white">
            <h3 className="text-base font-semibold text-white tracking-wide mb-6 flex items-center gap-2 print:text-black">
              <Award className="w-5 h-5 text-purple-500" />
              Lawyer Activity & Billing Leaderboard
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300 print:text-black">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500 text-xs font-bold uppercase tracking-wider print:border-black">
                    <th className="pb-3 pl-4">Staff Member</th>
                    <th className="pb-3">Firm Designation</th>
                    <th className="pb-3 text-center">Assigned Cases</th>
                    <th className="pb-3 text-center">Tasks Completed</th>
                    <th className="pb-3 text-right pr-4">Total Logged Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 print:divide-black">
                  {lawyerActivity.map((l: any, idx: number) => (
                    <tr key={l.id} className="hover:bg-[#1c1d22]/50 transition-colors">
                      <td className="py-4 pl-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs print:border-black">
                          {idx + 1}
                        </div>
                        <div>
                          <span className="font-semibold text-white print:text-black block">{l.name}</span>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className="text-xs text-slate-400 print:text-slate-700 bg-[#0a0a0a] px-2.5 py-1 rounded-md border border-white/5 print:border-slate-300 print:bg-slate-100">
                          {l.role}
                        </span>
                      </td>
                      <td className="py-4 text-center font-bold text-slate-300 print:text-black">{l.assignedCases}</td>
                      <td className="py-4 text-center font-bold text-slate-300 print:text-black">{l.completedTasks}</td>
                      <td className="py-4 text-right pr-4 font-mono font-bold text-emerald-400 print:text-emerald-700">
                        {l.hoursTracked} hrs
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Upcoming Hearings Quick schedule */}
          <div className="bg-[#151619] rounded-2xl border border-white/5 shadow-xl p-8 print:border-black print:bg-white">
            <h3 className="text-base font-semibold text-white tracking-wide mb-6 flex items-center gap-2 print:text-black">
              <Calendar className="w-5 h-5 text-amber-500" />
              Upcoming Case Trials & Court Appearances
            </h3>
            
            {upcomingHearings.length === 0 ? (
              <div className="text-center text-slate-500 py-8 text-xs italic">No upcoming trial appearances found.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingHearings.map((h: any) => (
                  <div key={h.id} className="bg-[#0a0a0a] rounded-xl border border-white/5 p-5 space-y-2 print:border-black print:bg-slate-50">
                    <div className="flex justify-between items-start gap-4">
                      <h4 className="font-semibold text-white text-sm print:text-black leading-snug">{h.title}</h4>
                      <span className="text-[10px] font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider shrink-0">
                        HEARING
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.03] text-xs text-slate-400 print:text-black">
                      <div>
                        <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">Date & Time</span>
                        <span className="font-mono">{new Date(h.date).toLocaleDateString()} {new Date(h.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">Court Venue</span>
                        <span>{h.venue}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------- TAB 2: OUTSTANDING LEGAL CLAIMS REPORT (Requirement 21) ----------------- */}
      {activeTab === 'claims' && (
        <div className="space-y-8 animate-fade-in print:bg-white print:text-black">
          {/* Header Panel */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6 print:border-black print:pb-4">
            <div>
              <h1 className="text-3xl font-semibold text-white tracking-wide flex items-center gap-2 print:text-black">
                <FileCode className="w-8 h-8 text-emerald-500 print:text-emerald-600" />
                Outstanding Legal Claims Report
              </h1>
              <p className="text-slate-400 text-sm mt-1 print:text-slate-700">Institutional reporting module compiling potential exposures, litigation stages, and estimated costs.</p>
            </div>
            
            {/* Download/Print controls */}
            <div className="flex items-center gap-3 self-start print:hidden">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-[#1a1c20] hover:bg-[#26282d] text-slate-300 px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/5 transition-all"
              >
                <Printer className="w-4 h-4" /> Direct Print
              </button>
              
              <div className="relative group">
                <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-950/20">
                  <Download className="w-4 h-4" /> Export Report
                </button>
                <div className="absolute right-0 mt-2 w-56 bg-[#151619] border border-white/10 rounded-xl shadow-2xl hidden group-hover:block z-50 overflow-hidden">
                  <button onClick={handleExportClaimsExcel} className="w-full text-left px-4 py-3 text-xs text-slate-300 hover:bg-[#26282d] hover:text-white flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Export to MS Excel (.xls)
                  </button>
                  <button onClick={handleExportClaimsWord} className="w-full text-left px-4 py-3 text-xs text-slate-300 hover:bg-[#26282d] hover:text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" /> Export to MS Word (.doc)
                  </button>
                  <button onClick={handleExportClaimsCSV} className="w-full text-left px-4 py-3 text-xs text-slate-300 hover:bg-[#26282d] hover:text-white flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-purple-500" /> Export standard CSV
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Filters Panel (Requirement 21) */}
          <div className="bg-[#151619] rounded-2xl border border-white/5 p-6 space-y-6 print:hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.03] pb-3">
              <Filter className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Report Filter Parameters</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Client Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Client</label>
                <select
                  value={filterClient}
                  onChange={(e) => setFilterClient(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">All Clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Department Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Department</label>
                <select
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">All Departments</option>
                  {uniqueDepartments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Court Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Court/Venue</label>
                <select
                  value={filterCourt}
                  onChange={(e) => setFilterCourt(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">All Courts</option>
                  {uniqueCourts.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Case Type Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Case Type</label>
                <select
                  value={filterCaseType}
                  onChange={(e) => setFilterCaseType(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">All Case Types</option>
                  {uniqueCaseTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Advocate Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Responsible Advocate</label>
                <select
                  value={filterAdvocate}
                  onChange={(e) => setFilterAdvocate(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">All Advocates</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>

              {/* Case Status Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Case Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="All">All Matters (Active & Closed)</option>
                  <option value="Active">Active Matters Only</option>
                  <option value="Closed">Closed Matters Only</option>
                </select>
              </div>

              {/* Timeframe Preset Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Reporting Timeframe</label>
                <select
                  value={timeframePreset}
                  onChange={(e) => setTimeframePreset(e.target.value as any)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="all">All-Time Records</option>
                  <option value="month">This Month</option>
                  <option value="quarter">This Quarter</option>
                  <option value="year">This Year</option>
                  <option value="custom">Custom Date Range</option>
                </select>
              </div>

              {/* Optional Custom Date Inputs */}
              {timeframePreset === 'custom' && (
                <div className="flex gap-2 items-center col-span-1 sm:col-span-2 lg:col-span-1">
                  <div className="flex-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-[11px] text-slate-300 focus:outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-[11px] text-slate-300 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Reset Filters */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setFilterClient('');
                  setFilterDepartment('');
                  setFilterCourt('');
                  setFilterCaseType('');
                  setFilterAdvocate('');
                  setFilterStatus('All');
                  setTimeframePreset('all');
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-slate-400 hover:text-white text-xs font-semibold underline"
              >
                Clear All Filter Parameters
              </button>
            </div>
          </div>

          {/* KPI Executive Totals Panel (Requirement 21) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Weighted Potential Exposure Card */}
            <div className="bg-[#151619] rounded-2xl border border-white/5 p-6 shadow-xl relative overflow-hidden print:border-black print:bg-slate-50">
              <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl"></div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Potential Exposure (Weighted)</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-rose-500 print:text-rose-700">${Math.round(claimsTotals.potentialExposureWeighted).toLocaleString()}</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-4">Weighted: Potential Loss &times; Likelihood %</span>
            </div>

            {/* Total Estimated Legal Fees Card */}
            <div className="bg-[#151619] rounded-2xl border border-white/5 p-6 shadow-xl relative overflow-hidden print:border-black print:bg-slate-50">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl"></div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Estimated Legal Fees</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-emerald-500 print:text-emerald-700">${Math.round(claimsTotals.estimatedFees).toLocaleString()}</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-4">Total estimated counsel rates & fees</span>
            </div>

            {/* Total Active Matters Card */}
            <div className="bg-[#151619] rounded-2xl border border-white/5 p-6 shadow-xl relative overflow-hidden print:border-black print:bg-slate-50">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl"></div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Active Matters</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-white print:text-black">{claimsTotals.active}</span>
                <span className="text-xs text-slate-400 font-medium ml-1">cases</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-4">Active matching criteria</span>
            </div>

            {/* Total Closed Matters Card */}
            <div className="bg-[#151619] rounded-2xl border border-white/5 p-6 shadow-xl relative overflow-hidden print:border-black print:bg-slate-50">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl"></div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Closed Matters</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-white print:text-black">{claimsTotals.closed}</span>
                <span className="text-xs text-slate-400 font-medium ml-1">cases</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-4">Closed matching criteria</span>
            </div>
          </div>

          {/* Institutional Report Results Table (Requirement 21) */}
          <div className="bg-[#151619] rounded-2xl border border-white/5 shadow-xl p-8 print:border-black print:bg-white">
            <h3 className="text-base font-semibold text-white tracking-wide mb-6 flex items-center gap-2 print:text-black">
              <List className="w-5 h-5 text-emerald-500" />
              Claims Ledger View
            </h3>

            {claimsLoading ? (
              <div className="text-center text-xs text-slate-400 py-12">Retrieving institutional archives...</div>
            ) : filteredClaimsCases.length === 0 ? (
              <div className="text-center text-slate-400 py-12 italic text-xs">No outstanding legal claims matching current filter criteria.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 print:text-black border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-slate-500 font-bold uppercase tracking-wider print:border-black text-[10px]">
                      <th className="pb-3 pl-2">No.</th>
                      <th className="pb-3">Name of Parties</th>
                      <th className="pb-3">Case Number</th>
                      <th className="pb-3">Nature of Claim</th>
                      <th className="pb-3">Stage / Status</th>
                      <th className="pb-3 text-center">Likelihood (%)</th>
                      <th className="pb-3 text-right">Potential Loss</th>
                      <th className="pb-3 text-right pr-2">Est. Fees & Costs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 print:divide-black">
                    {filteredClaimsCases.map((c, i) => {
                      const pLoss = Number(c.potential_loss || 0);
                      const fees = Number(c.estimated_legal_fees || 0);
                      return (
                        <tr key={c.id} className="hover:bg-white/[0.01] transition-colors">
                          <td className="py-4 pl-2 font-mono text-slate-500">{i + 1}</td>
                          <td className="py-4 font-semibold text-white print:text-black">{c.title}</td>
                          <td className="py-4 font-mono text-slate-400">{c.case_number || 'N/A'}</td>
                          <td className="py-4 text-slate-400 print:text-slate-800">
                            <span className="font-semibold block text-slate-300 print:text-black">{c.case_type || 'General'}</span>
                            <span className="text-[10px] block truncate max-w-xs">{c.description || 'No description'}</span>
                          </td>
                          <td className="py-4">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 print:border print:bg-slate-50">
                              {c.stage || c.status || 'Client Consultation'}
                            </span>
                          </td>
                          <td className="py-4 text-center font-bold text-amber-400 font-mono">{c.likelihood_of_loss_gain || 0}%</td>
                          <td className="py-4 text-right font-semibold font-mono text-rose-400">${pLoss.toLocaleString()}</td>
                          <td className="py-4 text-right font-semibold font-mono text-emerald-400 pr-2">${fees.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-white/[0.02] print:bg-slate-100 font-bold text-slate-200 print:text-black">
                      <td colSpan={4} className="py-4 pl-2 uppercase tracking-wider">GRAND TOTALS</td>
                      <td className="py-4">Active: {claimsTotals.active} | Closed: {claimsTotals.closed}</td>
                      <td className="py-4 text-center">-</td>
                      <td className="py-4 text-right text-rose-500 font-mono font-bold">${Math.round(claimsTotals.potentialLossRaw).toLocaleString()} <span className="block text-[9px] text-slate-500 font-normal">Weighted Exposure: $${Math.round(claimsTotals.potentialExposureWeighted).toLocaleString()}</span></td>
                      <td className="py-4 text-right text-emerald-500 font-mono font-bold pr-2">${Math.round(claimsTotals.estimatedFees).toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
