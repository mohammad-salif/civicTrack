import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ArrowLeft,
  BrainCircuit,
  Camera,
  CheckCircle2,
  Eye,
  FileSearch,
  MapPin,
  Upload,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PriorityLabel, StatusLabel, formatDateTime } from '../components/StatusLabels';
import { usePortal } from '../context/PortalContext';
import { formatTimeRemaining, hasPermission } from '../lib/rbac';
import type {
  ImageAnalysisResult,
  OperationalBriefingResult,
  PriorityLevel,
} from '../types/civic';

const REFERENCE_NOW = new Date('2026-11-24T09:15:00Z').getTime();

export const ComplaintDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentUser,
    complaints,
    departments,
    officers,
    performComplaintAction,
    analyzeEvidenceImage,
    requestOperationalBriefing,
    addToast,
  } = usePortal();

  const complaint = useMemo(
    () => complaints.find((c) => c.id === id) || null,
    [complaints, id]
  );

  const dept = useMemo(
    () => departments.find((d) => d.id === complaint?.assignedDepartmentId) || null,
    [departments, complaint]
  );

  const officer = useMemo(
    () => officers.find((o) => o.id === complaint?.assignedOfficerId) || null,
    [officers, complaint]
  );

  const [detailTab, setDetailTab] = useState<'overview' | 'history' | 'briefing'>('overview');

  const miniMapContainerRef = useRef<HTMLDivElement | null>(null);
  const miniMapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!complaint || detailTab !== 'overview' || !miniMapContainerRef.current) return;
    if (miniMapRef.current) {
      miniMapRef.current.remove();
      miniMapRef.current = null;
    }
    const map = L.map(miniMapContainerRef.current, {
      center: [complaint.coordinates.lat, complaint.coordinates.lng],
      zoom: 15,
      zoomControl: true,
      scrollWheelZoom: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    L.circleMarker([complaint.coordinates.lat, complaint.coordinates.lng], {
      radius: 9,
      color: '#2457C5',
      fillColor: '#2457C5',
      fillOpacity: 0.75,
      weight: 2,
    })
      .addTo(map)
      .bindPopup(`${complaint.id} — ${complaint.address}`)
      .openPopup();
    miniMapRef.current = map;

    return () => {
      map.remove();
      miniMapRef.current = null;
    };
  }, [
    detailTab,
    complaint?.id,
    complaint?.coordinates.lat,
    complaint?.coordinates.lng,
    complaint?.address,
  ]);

  const [activeAction, setActiveAction] = useState<
    | null
    | 'review'
    | 'priority'
    | 'assign'
    | 'start_work'
    | 'submit_resolution'
    | 'verify'
    | 'escalate'
    | 'reject'
  >(null);

  const [selectedPriority, setSelectedPriority] = useState<PriorityLevel>('High');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>('');
  const [assignDeadline, setAssignDeadline] = useState<string>('');
  const [assignInstructions, setAssignInstructions] = useState<string>('');
  const [actionNote, setActionNote] = useState<string>('');

  const [remarkInput, setRemarkInput] = useState('');

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadType, setUploadType] = useState<'Supporting' | 'Progress' | 'Resolution'>('Progress');
  const [uploadedPreview, setUploadedPreview] = useState<{
    dataUrl: string;
    mimeType: string;
  } | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [analyzingImageId, setAnalyzingImageId] = useState<string | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState<ImageAnalysisResult | null>(null);
  const [imageAnalysisError, setImageAnalysisError] = useState<string | null>(null);

  const [briefingQuery, setBriefingQuery] = useState(
    'Assess SLA breach risk, root-cause dependencies, and recommended supervisory actions for this complaint.'
  );
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(false);
  const [briefingResult, setBriefingResult] = useState<OperationalBriefingResult | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  useEffect(() => {
    if (complaint) {
      setSelectedPriority(complaint.priority);
      setSelectedDeptId(complaint.assignedDepartmentId || departments[0]?.id || '');
      setSelectedOfficerId(complaint.assignedOfficerId || '');
      setAssignDeadline(complaint.resolutionDeadline.slice(0, 16));
      setAssignInstructions(complaint.assignmentInstructions || '');
    }
  }, [complaint, departments]);

  const deptOfficers = useMemo(() => {
    return officers.filter((o) => o.departmentId === selectedDeptId && o.status === 'Active');
  }, [officers, selectedDeptId]);

  if (!complaint || !currentUser) {
    return (
      <div className="rounded-md border border-[#E5E7EB] bg-white p-8 text-center">
        <h2 className="text-sm font-semibold text-[#202938]">Complaint Record Not Found</h2>
        <p className="mt-1 text-xs text-[#687385]">
          This complaint does not exist or lies outside your authorized administrative scope.
        </p>
        <Link
          to="/complaints"
          className="mt-4 inline-block rounded bg-[#2457C5] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#1D46A3]"
        >
          Return to Complaints Registry
        </Link>
      </div>
    );
  }

  const sla = formatTimeRemaining(complaint.resolutionDeadline, complaint.status, REFERENCE_NOW);
  const role = currentUser.role;
  const canReview = hasPermission(role, 'review_complaint');
  const canPriority = hasPermission(role, 'change_priority');
  const canAssign = hasPermission(role, 'assign_complaint');
  const canProgress = hasPermission(role, 'update_field_progress');
  const canVerify = hasPermission(role, 'verify_resolution');
  const canEscalate = hasPermission(role, 'escalate_complaint');
  const canReject = hasPermission(role, 'reject_complaint');
  const canRemark = hasPermission(role, 'add_remarks');
  const canUpload = hasPermission(role, 'upload_evidence');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast({ type: 'error', title: 'Invalid File', message: 'Please upload an image file.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedPreview({ dataUrl: reader.result, mimeType: file.type });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedPreview) return;
    setIsUploadingPhoto(true);
    await performComplaintAction(complaint.id, {
      actionType: 'add_evidence',
      photoUrl: uploadedPreview.dataUrl,
      photoCaption: uploadCaption || `${uploadType} photo uploaded by ${currentUser.name}`,
      photoType: uploadType,
    });
    setIsUploadingPhoto(false);
    setUploadedPreview(null);
    setUploadCaption('');
  };

  const handleAnalyzePhoto = async (photoId: string, url: string) => {
    setAnalyzingImageId(photoId);
    setImageAnalysisError(null);
    try {
      const payload = url.startsWith('data:')
        ? {
            imageBase64: url,
            complaintContext: `${complaint.id}: ${complaint.title} (${complaint.category}, ${complaint.ward})`,
          }
        : {
            assetPath: url,
            complaintContext: `${complaint.id}: ${complaint.title} (${complaint.category}, ${complaint.ward})`,
          };
      const result = await analyzeEvidenceImage(payload);
      setImageAnalysis(result);
    } catch (err: unknown) {
      setImageAnalysisError(
        err instanceof Error ? err.message : 'Unable to analyze evidence photo.'
      );
    } finally {
      setAnalyzingImageId(null);
    }
  };

  const handleGenerateBriefing = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingBriefing(true);
    setBriefingError(null);
    try {
      const result = await requestOperationalBriefing({
        query: briefingQuery,
        complaintId: complaint.id,
      });
      setBriefingResult(result);
    } catch (err: unknown) {
      setBriefingError(
        err instanceof Error ? err.message : 'Unable to generate operational briefing.'
      );
    } finally {
      setIsLoadingBriefing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Structured Case Header Panel */}
      <section className="rounded-md border border-[#E5E7EB] bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1 rounded border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-1 text-xs font-medium text-[#202938] hover:bg-[#F3F4F6]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
              <span className="font-mono-tabular text-sm font-semibold text-[#2457C5]">
                {complaint.id}
              </span>
              <StatusLabel status={complaint.status} />
              <PriorityLabel priority={complaint.priority} />
              {complaint.escalationLevel > 0 && (
                <span className="text-xs font-semibold text-[#D94B4B]">
                  Escalation Level {complaint.escalationLevel}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-[#202938]">{complaint.title}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#687385]">
              <span>{complaint.category}</span>
              <span>·</span>
              <span>{complaint.ward}</span>
              <span>·</span>
              <span>Submitted {formatDateTime(complaint.reportedAt)}</span>
              <span>·</span>
              <span className={sla.isOverdue ? 'font-semibold text-[#D94B4B]' : 'text-[#23845B]'}>
                {sla.label}
              </span>
            </div>
          </div>

          {/* Primary Administrative Action Bar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canReview && complaint.status === 'New' && (
              <button
                type="button"
                onClick={() => {
                  setActionNote('');
                  setActiveAction('review');
                }}
                className="rounded border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#202938] hover:bg-[#F5F6F8] whitespace-nowrap"
              >
                Review
              </button>
            )}
            {canPriority && (
              <button
                type="button"
                onClick={() => {
                  setActionNote('');
                  setActiveAction('priority');
                }}
                className="rounded border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#202938] hover:bg-[#F5F6F8] whitespace-nowrap"
              >
                Priority
              </button>
            )}
            {canAssign && (
              <button
                type="button"
                onClick={() => setActiveAction('assign')}
                className="rounded bg-[#2457C5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1D46A3] whitespace-nowrap"
              >
                {complaint.assignedDepartmentId ? 'Reassign' : 'Assign'}
              </button>
            )}
            {canProgress && (complaint.status === 'Pending' || complaint.status === 'Escalated') && (
              <button
                type="button"
                onClick={() => {
                  setActionNote('');
                  setActiveAction('start_work');
                }}
                className="rounded bg-[#2457C5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1D46A3] whitespace-nowrap"
              >
                Start Work
              </button>
            )}
            {canProgress && complaint.status === 'In Progress' && (
              <button
                type="button"
                onClick={() => {
                  setActionNote('');
                  setActiveAction('submit_resolution');
                }}
                className="rounded bg-[#23845B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1B6A49] whitespace-nowrap"
              >
                Submit Resolution
              </button>
            )}
            {canVerify &&
              (complaint.status === 'Resolution Submitted' || complaint.status === 'In Progress') && (
                <button
                  type="button"
                  onClick={() => {
                    setActionNote('');
                    setActiveAction('verify');
                  }}
                  className="inline-flex items-center gap-1 rounded bg-[#23845B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1B6A49] whitespace-nowrap"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Verify & Close</span>
                </button>
              )}
            {canEscalate && complaint.status !== 'Resolved' && complaint.status !== 'Rejected' && (
              <button
                type="button"
                onClick={() => {
                  setActionNote('');
                  setActiveAction('escalate');
                }}
                className="rounded border border-[#D99A32] bg-white px-3 py-1.5 text-xs font-medium text-[#B37512] hover:bg-[#FEF7E6] whitespace-nowrap"
              >
                Escalate
              </button>
            )}
            {canReject && complaint.status !== 'Resolved' && complaint.status !== 'Rejected' && (
              <button
                type="button"
                onClick={() => {
                  setActionNote('');
                  setActiveAction('reject');
                }}
                className="rounded border border-[#D94B4B] bg-white px-3 py-1.5 text-xs font-medium text-[#D94B4B] hover:bg-[#FEF0F0] whitespace-nowrap"
              >
                Reject
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left Column (8 cols) with Organized Section Tabs */}
        <div className="space-y-4 lg:col-span-8">
          <div className="flex items-center gap-1 border-b border-[#E5E7EB]">
            <button
              type="button"
              onClick={() => setDetailTab('overview')}
              className={`border-b-2 px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                detailTab === 'overview'
                  ? 'border-[#2457C5] text-[#2457C5]'
                  : 'border-transparent text-[#687385] hover:text-[#202938]'
              }`}
            >
              Case Details & Evidence
            </button>
            <button
              type="button"
              onClick={() => setDetailTab('history')}
              className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                detailTab === 'history'
                  ? 'border-[#2457C5] text-[#2457C5]'
                  : 'border-transparent text-[#687385] hover:text-[#202938]'
              }`}
            >
              <span>Complaint History</span>
              <span className="rounded-sm bg-[#F3F4F6] px-1.5 py-0.5 font-mono-tabular text-[10px] text-[#687385]">
                {complaint.history.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDetailTab('briefing')}
              className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                detailTab === 'briefing'
                  ? 'border-[#2457C5] text-[#2457C5]'
                  : 'border-transparent text-[#687385] hover:text-[#202938]'
              }`}
            >
              <BrainCircuit className="h-3.5 w-3.5" />
              <span>Decision Briefing</span>
            </button>
          </div>

          {detailTab === 'overview' && (
            <div className="space-y-5">
              {/* Complaint Information */}
              <section className="rounded-md border border-[#E5E7EB] bg-white">
                <div className="border-b border-[#E5E7EB] px-5 py-3">
                  <h3 className="text-sm font-semibold text-[#202938]">Complaint Information</h3>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <div className="text-xs font-medium text-[#687385]">Description</div>
                    <p className="mt-1 text-sm leading-relaxed text-[#202938]">
                      {complaint.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-[#E5E7EB] pt-4 sm:grid-cols-3 text-xs">
                    <div>
                      <div className="text-[#687385]">Category</div>
                      <div className="mt-0.5 font-medium text-[#202938]">{complaint.category}</div>
                    </div>
                    <div>
                      <div className="text-[#687385]">Reported Severity</div>
                      <div className="mt-0.5 font-medium text-[#202938]">{complaint.severity}</div>
                    </div>
                    <div>
                      <div className="text-[#687385]">Ward & District</div>
                      <div className="mt-0.5 font-medium text-[#202938]">
                        {complaint.ward} · {complaint.district}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-[#687385]">Street Address</div>
                      <div className="mt-0.5 font-medium text-[#202938]">{complaint.address}</div>
                    </div>
                    <div>
                      <div className="text-[#687385]">GPS Coordinates</div>
                      <div className="mt-0.5 font-mono-tabular font-medium text-[#202938]">
                        {complaint.coordinates.lat.toFixed(4)},{' '}
                        {complaint.coordinates.lng.toFixed(4)}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#E5E7EB] pt-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[#202938]">
                        Citizen Information
                      </div>
                      {!hasPermission(role, 'view_citizen_full_info') && (
                        <span className="text-[11px] text-[#687385]">
                          Contact fields restricted by role policy
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                      <div>
                        <div className="text-[#687385]">Citizen ID</div>
                        <div className="mt-0.5 font-mono-tabular text-[#202938]">
                          {complaint.citizen.citizenId}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#687385]">Complainant</div>
                        <div className="mt-0.5 text-[#202938]">{complaint.citizen.name}</div>
                      </div>
                      <div>
                        <div className="text-[#687385]">Phone</div>
                        <div className="mt-0.5 font-mono-tabular text-[#202938]">
                          {complaint.citizen.phone}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#687385]">Email</div>
                        <div className="mt-0.5 text-[#202938] truncate">
                          {complaint.citizen.email}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Photographic Evidence & Geolocation */}
              <section className="rounded-md border border-[#E5E7EB] bg-white">
                <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#202938]">
                      Evidence Photographs & Location Map
                    </h3>
                    <p className="text-xs text-[#687385]">
                      Inspection media, upload tools, and advisory image analysis
                    </p>
                  </div>
                  <span className="font-mono-tabular text-xs text-[#687385]">
                    {complaint.evidencePhotos.length} photo(s)
                  </span>
                </div>

                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-3">
                      {complaint.evidencePhotos.length === 0 ? (
                        <div className="flex h-56 flex-col items-center justify-center rounded border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-4 text-center">
                          <Camera className="h-6 w-6 text-[#687385]" />
                          <div className="mt-2 text-xs font-medium text-[#202938]">
                            No citizen photographs attached
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#687385]">
                            Field staff can upload inspection photos below.
                          </div>
                        </div>
                      ) : (
                        complaint.evidencePhotos.map((photo) => (
                          <div
                            key={photo.id}
                            className="rounded border border-[#E5E7EB] bg-[#FAFBFC] overflow-hidden"
                          >
                            <div className="aspect-[4/3] bg-[#E5E7EB]">
                              <img
                                src={photo.url}
                                alt={photo.caption}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="p-3 space-y-2">
                              <div className="flex items-center justify-between text-[11px] text-[#687385]">
                                <span className="font-semibold text-[#202938]">{photo.type}</span>
                                <span>{formatDateTime(photo.uploadedAt)}</span>
                              </div>
                              <p className="text-xs text-[#202938]">{photo.caption}</p>
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setLightboxUrl(photo.url)}
                                  className="inline-flex items-center gap-1 rounded border border-[#E5E7EB] bg-white px-2.5 py-1 text-[11px] font-medium text-[#202938] hover:bg-[#F5F6F8]"
                                >
                                  <Eye className="h-3 w-3" />
                                  <span>Preview</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={analyzingImageId === photo.id}
                                  onClick={() => handleAnalyzePhoto(photo.id, photo.url)}
                                  className="inline-flex items-center gap-1 rounded border border-[#2457C5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#2457C5] hover:bg-[#EFF4FF] disabled:opacity-50"
                                >
                                  <FileSearch className="h-3 w-3" />
                                  <span>
                                    {analyzingImageId === photo.id
                                      ? 'Analyzing...'
                                      : 'Analyze Photo'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-[#687385]">
                        <span className="inline-flex items-center gap-1 font-medium text-[#202938]">
                          <MapPin className="h-3.5 w-3.5 text-[#2457C5]" />
                          <span>Geotagged Site Location</span>
                        </span>
                        <Link to="/map" className="text-[#2457C5] hover:underline">
                          Open Live Map →
                        </Link>
                      </div>
                      <div
                        ref={miniMapContainerRef}
                        className="h-64 w-full rounded border border-[#E5E7EB] bg-[#F5F6F8]"
                      />
                      <div className="text-[11px] text-[#687385]">
                        {complaint.address} ({complaint.coordinates.lat.toFixed(4)},{' '}
                        {complaint.coordinates.lng.toFixed(4)})
                      </div>
                    </div>
                  </div>

                  {(imageAnalysis || imageAnalysisError) && (
                    <div className="rounded border border-[#E5E7EB] bg-[#F9FAFB] p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-[#202938]">
                          Photographic Inspection Findings (Advisory)
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setImageAnalysis(null);
                            setImageAnalysisError(null);
                          }}
                          className="text-xs text-[#687385] hover:text-[#202938]"
                        >
                          Clear
                        </button>
                      </div>
                      {imageAnalysisError ? (
                        <div className="text-xs text-[#D94B4B]">{imageAnalysisError}</div>
                      ) : (
                        imageAnalysis && (
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="font-medium text-[#687385]">Observed Condition: </span>
                              <span className="text-[#202938]">
                                {imageAnalysis.observedCondition}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <span className="font-medium text-[#687385]">
                                  Suggested Category:{' '}
                                </span>
                                <span className="text-[#202938]">
                                  {imageAnalysis.suggestedCategory}
                                </span>
                              </div>
                              <div>
                                <span className="font-medium text-[#687385]">
                                  Severity Indicators:{' '}
                                </span>
                                <span className="text-[#202938]">
                                  {imageAnalysis.severityIndicators}
                                </span>
                              </div>
                            </div>
                            {imageAnalysis.visibleHazards?.length > 0 && (
                              <div>
                                <div className="font-medium text-[#687385]">Visible Hazards:</div>
                                <ul className="mt-1 list-disc pl-5 text-[#202938] space-y-0.5">
                                  {imageAnalysis.visibleHazards.map((h, i) => (
                                    <li key={i}>{h}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {imageAnalysis.recommendedVerificationSteps?.length > 0 && (
                              <div>
                                <div className="font-medium text-[#687385]">
                                  Field Verification Steps:
                                </div>
                                <ul className="mt-1 list-disc pl-5 text-[#202938] space-y-0.5">
                                  {imageAnalysis.recommendedVerificationSteps.map((s, i) => (
                                    <li key={i}>{s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="border-t border-[#E5E7EB] pt-2 text-[11px] text-[#687385]">
                              {imageAnalysis.advisoryNotice ||
                                'Advisory inspection summary only. Final administrative decisions remain with authorized officials.'}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {canUpload && (
                    <form
                      onSubmit={handleUploadEvidence}
                      className="border-t border-[#E5E7EB] pt-4 space-y-3"
                    >
                      <div className="text-xs font-semibold text-[#202938]">
                        Upload Inspection or Resolution Photo
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="block text-[11px] font-medium text-[#687385] mb-1">
                            Photo File
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="block w-full text-xs text-[#687385] file:mr-2 file:rounded file:border file:border-[#E5E7EB] file:bg-white file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-[#202938] hover:file:bg-[#F5F6F8]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#687385] mb-1">
                            Evidence Type
                          </label>
                          <select
                            value={uploadType}
                            onChange={(e) =>
                              setUploadType(
                                e.target.value as 'Supporting' | 'Progress' | 'Resolution'
                              )
                            }
                            className="w-full rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#202938]"
                          >
                            <option value="Supporting">Supporting Evidence</option>
                            <option value="Progress">Field Work Progress</option>
                            <option value="Resolution">Resolution Verification</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#687385] mb-1">
                            Caption
                          </label>
                          <input
                            type="text"
                            value={uploadCaption}
                            onChange={(e) => setUploadCaption(e.target.value)}
                            placeholder="Describe inspection photo..."
                            className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5 text-xs text-[#202938]"
                          />
                        </div>
                      </div>
                      {uploadedPreview && (
                        <div className="flex flex-wrap items-center gap-3">
                          <img
                            src={uploadedPreview.dataUrl}
                            alt="Upload preview"
                            className="h-20 w-28 rounded border border-[#E5E7EB] object-cover"
                          />
                          <button
                            type="submit"
                            disabled={isUploadingPhoto}
                            className="inline-flex items-center gap-1.5 rounded bg-[#2457C5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1D46A3] disabled:opacity-50"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            <span>
                              {isUploadingPhoto ? 'Uploading...' : 'Attach Photo to Record'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleAnalyzePhoto('uploaded-preview', uploadedPreview.dataUrl)
                            }
                            className="inline-flex items-center gap-1.5 rounded border border-[#2457C5] bg-white px-3 py-1.5 text-xs font-medium text-[#2457C5] hover:bg-[#EFF4FF]"
                          >
                            <FileSearch className="h-3.5 w-3.5" />
                            <span>Analyze Uploaded Photo</span>
                          </button>
                        </div>
                      )}
                    </form>
                  )}
                </div>
              </section>
            </div>
          )}

          {detailTab === 'history' && (
            <section className="rounded-md border border-[#E5E7EB] bg-white">
              <div className="border-b border-[#E5E7EB] px-5 py-3">
                <h3 className="text-sm font-semibold text-[#202938]">
                  Chronological Complaint History
                </h3>
                <p className="text-xs text-[#687385]">
                  Complete audit log of status changes, reviews, and field updates
                </p>
              </div>
              <div className="divide-y divide-[#E5E7EB]">
                {complaint.history.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div>
                      <div className="text-xs font-medium text-[#202938]">{ev.action}</div>
                      <div className="mt-0.5 text-[11px] text-[#687385]">
                        {ev.actorName} ({ev.actorRole})
                        {ev.previousStatus && ev.newStatus && ev.previousStatus !== ev.newStatus
                          ? ` · Status: ${ev.previousStatus} → ${ev.newStatus}`
                          : ''}
                      </div>
                      {ev.remarks && (
                        <div className="mt-1.5 text-xs text-[#202938] bg-[#F9FAFB] border border-[#E5E7EB] rounded px-3 py-2">
                          {ev.remarks}
                        </div>
                      )}
                    </div>
                    <div className="font-mono-tabular text-[11px] text-[#687385] whitespace-nowrap">
                      {formatDateTime(ev.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {detailTab === 'briefing' && (
            <section className="rounded-md border border-[#E5E7EB] bg-white">
              <div className="border-b border-[#E5E7EB] px-5 py-3">
                <div className="flex items-center gap-1.5">
                  <BrainCircuit className="h-4 w-4 text-[#2457C5]" />
                  <h3 className="text-sm font-semibold text-[#202938]">
                    Operational Decision Briefing
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-[#687385]">
                  Deep SLA & dependency analysis for authorized officials (advisory only)
                </p>
              </div>
              <div className="p-5 space-y-4">
                <form onSubmit={handleGenerateBriefing} className="space-y-2.5">
                  <label className="block text-xs font-medium text-[#202938]">
                    Operational Analysis Prompt
                  </label>
                  <textarea
                    rows={3}
                    value={briefingQuery}
                    onChange={(e) => setBriefingQuery(e.target.value)}
                    className="w-full rounded border border-[#E5E7EB] p-2.5 text-xs text-[#202938] focus:border-[#2457C5] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isLoadingBriefing}
                    className="rounded bg-[#2457C5] px-4 py-2 text-xs font-medium text-white hover:bg-[#1D46A3] disabled:opacity-50"
                  >
                    {isLoadingBriefing ? 'Generating Briefing...' : 'Generate Advisory Briefing'}
                  </button>
                </form>

                {briefingError && (
                  <div className="rounded border border-[#F4C2C2] bg-[#FEF0F0] p-3 text-xs text-[#D94B4B]">
                    {briefingError}
                  </div>
                )}

                {briefingResult && (
                  <div className="space-y-3 border-t border-[#E5E7EB] pt-4 text-xs">
                    <div>
                      <div className="font-semibold text-[#202938]">Summary</div>
                      <p className="mt-0.5 text-[#687385]">{briefingResult.summary}</p>
                    </div>
                    <div>
                      <div className="font-semibold text-[#202938]">Root-Cause Assessment</div>
                      <p className="mt-0.5 text-[#687385]">{briefingResult.rootCauseAssessment}</p>
                    </div>
                    <div>
                      <div className="font-semibold text-[#202938]">SLA Risk</div>
                      <p className="mt-0.5 text-[#687385]">{briefingResult.slaRiskAssessment}</p>
                    </div>
                    {briefingResult.recommendedActions?.length > 0 && (
                      <div>
                        <div className="font-semibold text-[#202938]">Recommended Actions</div>
                        <ul className="mt-1 list-disc pl-4 text-[#202938] space-y-1">
                          {briefingResult.recommendedActions.map((act, idx) => (
                            <li key={idx}>{act}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="text-[11px] text-[#687385] border-t border-[#E5E7EB] pt-2">
                      {briefingResult.advisoryNotice}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Right Column (4 cols): Administrative Info & Internal Remarks */}
        <div className="space-y-5 lg:col-span-4">
          <section className="rounded-md border border-[#E5E7EB] bg-white">
            <div className="border-b border-[#E5E7EB] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#202938]">Administrative Information</h3>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2.5">
                <span className="text-[#687385]">Current Status</span>
                <StatusLabel status={complaint.status} />
              </div>
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2.5">
                <span className="text-[#687385]">Priority Level</span>
                <PriorityLabel priority={complaint.priority} />
              </div>
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2.5">
                <span className="text-[#687385]">Assigned Department</span>
                <span className="font-medium text-[#202938]">
                  {dept ? dept.name : 'Unassigned'}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2.5">
                <span className="text-[#687385]">Assigned Officer</span>
                <span className="font-medium text-[#202938] text-right">
                  {officer ? `${officer.name} (${officer.employeeId})` : 'Unassigned'}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2.5">
                <span className="text-[#687385]">Resolution Deadline</span>
                <span className="font-mono-tabular text-[#202938]">
                  {formatDateTime(complaint.resolutionDeadline)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#687385]">SLA Standing</span>
                <span
                  className={`font-mono-tabular font-medium ${
                    sla.isOverdue ? 'text-[#D94B4B]' : 'text-[#23845B]'
                  }`}
                >
                  {sla.label}
                </span>
              </div>

              {complaint.assignmentInstructions && (
                <div className="border-t border-[#E5E7EB] pt-3">
                  <div className="text-[#687385] mb-1">Assignment Directives</div>
                  <div className="rounded border border-[#E5E7EB] bg-[#F9FAFB] p-2.5 text-[#202938]">
                    {complaint.assignmentInstructions}
                  </div>
                </div>
              )}

              {complaint.escalationReason && (
                <div className="border-t border-[#E5E7EB] pt-3">
                  <div className="text-[#D94B4B] font-medium mb-1">Escalation Record</div>
                  <div className="rounded border border-[#F4C2C2] bg-[#FEF0F0] p-2.5 text-[#202938]">
                    {complaint.escalationReason}
                  </div>
                </div>
              )}

              {complaint.rejectionReason && (
                <div className="border-t border-[#E5E7EB] pt-3">
                  <div className="text-[#687385] font-medium mb-1">Rejection Justification</div>
                  <div className="rounded border border-[#E5E7EB] bg-[#F3F4F6] p-2.5 text-[#202938]">
                    {complaint.rejectionReason}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-md border border-[#E5E7EB] bg-white">
            <div className="border-b border-[#E5E7EB] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#202938]">Internal Official Remarks</h3>
            </div>
            <div className="p-4 space-y-3">
              {complaint.internalRemarks.length === 0 ? (
                <div className="text-xs text-[#687385]">No internal remarks logged yet.</div>
              ) : (
                <div className="space-y-2.5">
                  {complaint.internalRemarks.map((r) => (
                    <div
                      key={r.id}
                      className="rounded border border-[#E5E7EB] bg-[#F9FAFB] p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#687385]">
                        <span className="font-medium text-[#202938]">
                          {r.authorName} · {r.authorRole}
                        </span>
                        <span className="font-mono-tabular">{formatDateTime(r.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-[#202938]">{r.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {canRemark && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!remarkInput.trim()) return;
                    await performComplaintAction(complaint.id, {
                      actionType: 'add_remark',
                      remark: remarkInput,
                    });
                    setRemarkInput('');
                  }}
                  className="border-t border-[#E5E7EB] pt-3 space-y-2"
                >
                  <textarea
                    rows={2}
                    value={remarkInput}
                    onChange={(e) => setRemarkInput(e.target.value)}
                    placeholder="Add internal administrative note..."
                    className="w-full rounded border border-[#E5E7EB] p-2 text-xs text-[#202938] focus:border-[#2457C5] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!remarkInput.trim()}
                    className="rounded border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#202938] hover:bg-[#F5F6F8] disabled:opacity-40"
                  >
                    Save Internal Remark
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#202938]/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-white rounded p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute right-3 top-3 rounded bg-white/90 p-1.5 text-[#202938] shadow"
              aria-label="Close image preview"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={lightboxUrl}
              alt="Evidence full preview"
              className="max-h-[80vh] w-full object-contain rounded"
            />
          </div>
        </div>
      )}

      {/* Action Confirmation Dialogs */}
      <ConfirmDialog
        open={activeAction === 'review'}
        title="Confirm Administrative Review"
        description={`Mark complaint ${complaint.id} as reviewed by ${currentUser.name}?`}
        confirmLabel="Mark as Reviewed"
        onCancel={() => setActiveAction(null)}
        onConfirm={async () => {
          await performComplaintAction(complaint.id, {
            actionType: 'review',
            remark: actionNote,
          });
          setActiveAction(null);
        }}
      >
        <textarea
          rows={2}
          value={actionNote}
          onChange={(e) => setActionNote(e.target.value)}
          placeholder="Optional review remarks..."
          className="w-full rounded border border-[#E5E7EB] p-2 text-xs text-[#202938]"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={activeAction === 'priority'}
        title="Update Complaint Priority"
        description={`Select the updated administrative priority level for ${complaint.id}.`}
        confirmLabel="Update Priority"
        onCancel={() => setActiveAction(null)}
        onConfirm={async () => {
          await performComplaintAction(complaint.id, {
            actionType: 'change_priority',
            priority: selectedPriority,
            remark: actionNote,
          });
          setActiveAction(null);
        }}
      >
        <div className="space-y-2.5">
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value as PriorityLevel)}
            className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5 text-xs text-[#202938]"
          >
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <textarea
            rows={2}
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            placeholder="Reason for priority change..."
            className="w-full rounded border border-[#E5E7EB] p-2 text-xs text-[#202938]"
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={activeAction === 'assign'}
        title={complaint.assignedDepartmentId ? 'Reassign Complaint' : 'Assign Department & Officer'}
        description={`Assign ${complaint.id} to a responsible municipal department and officer within that department.`}
        confirmLabel="Confirm Assignment"
        disabled={!selectedDeptId}
        onCancel={() => setActiveAction(null)}
        onConfirm={async () => {
          await performComplaintAction(complaint.id, {
            actionType: 'assign',
            departmentId: selectedDeptId,
            officerId: selectedOfficerId || null,
            resolutionDeadline: assignDeadline,
            instructions: assignInstructions,
          });
          setActiveAction(null);
        }}
      >
        <div className="space-y-2.5 text-xs">
          <div>
            <label className="block font-medium text-[#202938] mb-1">Responsible Department</label>
            <select
              value={selectedDeptId}
              onChange={(e) => {
                setSelectedDeptId(e.target.value);
                setSelectedOfficerId('');
              }}
              className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5 text-[#202938]"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium text-[#202938] mb-1">
              Available Department Officer
            </label>
            <select
              value={selectedOfficerId}
              onChange={(e) => setSelectedOfficerId(e.target.value)}
              className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5 text-[#202938]"
            >
              <option value="">-- Assign to Department Queue Only --</option>
              {deptOfficers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.designation} · {o.availability})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium text-[#202938] mb-1">Resolution Deadline</label>
            <input
              type="datetime-local"
              value={assignDeadline}
              onChange={(e) => setAssignDeadline(e.target.value)}
              className="w-full rounded border border-[#E5E7EB] px-2.5 py-1.5 text-[#202938]"
            />
          </div>
          <div>
            <label className="block font-medium text-[#202938] mb-1">
              Operational Instructions
            </label>
            <textarea
              rows={2}
              value={assignInstructions}
              onChange={(e) => setAssignInstructions(e.target.value)}
              placeholder="Field directives or safety instructions..."
              className="w-full rounded border border-[#E5E7EB] p-2 text-[#202938]"
            />
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={activeAction === 'start_work'}
        title="Confirm Field Work Mobilization"
        description={`Transition ${complaint.id} to In Progress status and log mobilization time.`}
        confirmLabel="Start Field Work"
        onCancel={() => setActiveAction(null)}
        onConfirm={async () => {
          await performComplaintAction(complaint.id, {
            actionType: 'update_progress',
            status: 'In Progress',
            remark: actionNote,
          });
          setActiveAction(null);
        }}
      >
        <textarea
          rows={2}
          value={actionNote}
          onChange={(e) => setActionNote(e.target.value)}
          placeholder="Field crew arrival / mobilization remarks..."
          className="w-full rounded border border-[#E5E7EB] p-2 text-xs text-[#202938]"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={activeAction === 'submit_resolution'}
        title="Submit Resolution for Verification"
        description={`Submit field completion report for ${complaint.id}. An authorized administrator will verify before final closure.`}
        confirmLabel="Submit Resolution"
        onCancel={() => setActiveAction(null)}
        onConfirm={async () => {
          await performComplaintAction(complaint.id, {
            actionType: 'update_progress',
            status: 'Resolution Submitted',
            remark: actionNote,
          });
          setActiveAction(null);
        }}
      >
        <textarea
          rows={2}
          value={actionNote}
          onChange={(e) => setActionNote(e.target.value)}
          placeholder="Summary of repairs completed..."
          className="w-full rounded border border-[#E5E7EB] p-2 text-xs text-[#202938]"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={activeAction === 'verify'}
        title="Verify Resolution & Close Complaint"
        description={`Confirm that field work for ${complaint.id} satisfies municipal standards and close this complaint as Resolved.`}
        confirmLabel="Verify & Close"
        onCancel={() => setActiveAction(null)}
        onConfirm={async () => {
          await performComplaintAction(complaint.id, {
            actionType: 'verify_resolution',
            remark: actionNote,
          });
          setActiveAction(null);
        }}
      >
        <textarea
          rows={2}
          value={actionNote}
          onChange={(e) => setActionNote(e.target.value)}
          placeholder="Final verification notes..."
          className="w-full rounded border border-[#E5E7EB] p-2 text-xs text-[#202938]"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={activeAction === 'escalate'}
        title="Escalate Complaint"
        description={`Escalate ${complaint.id} to Critical priority and notify supervisory leadership.`}
        confirmLabel="Confirm Escalation"
        confirmVariant="danger"
        disabled={!actionNote.trim()}
        onCancel={() => setActiveAction(null)}
        onConfirm={async () => {
          await performComplaintAction(complaint.id, {
            actionType: 'escalate',
            reason: actionNote,
          });
          setActiveAction(null);
        }}
      >
        <div>
          <label className="block text-xs font-medium text-[#202938] mb-1">
            Escalation Reason (Required)
          </label>
          <textarea
            rows={3}
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            placeholder="State escalation reason..."
            className="w-full rounded border border-[#E5E7EB] p-2 text-xs text-[#202938]"
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={activeAction === 'reject'}
        title="Reject Complaint"
        description={`Rejecting ${complaint.id} permanently closes the submission. A formal administrative reason is mandatory.`}
        confirmLabel="Reject Complaint"
        confirmVariant="danger"
        disabled={!actionNote.trim()}
        onCancel={() => setActiveAction(null)}
        onConfirm={async () => {
          await performComplaintAction(complaint.id, {
            actionType: 'reject',
            reason: actionNote,
          });
          setActiveAction(null);
        }}
      >
        <div>
          <label className="block text-xs font-medium text-[#202938] mb-1">
            Mandatory Rejection Reason
          </label>
          <textarea
            rows={3}
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            placeholder="e.g., Duplicate ticket, private property outside municipal right-of-way..."
            className="w-full rounded border border-[#E5E7EB] p-2 text-xs text-[#202938]"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
};
