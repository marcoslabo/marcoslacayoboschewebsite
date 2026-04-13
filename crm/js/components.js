// ==========================================================================
// CRM UI Components
// ==========================================================================

const CRMComponents = {

    // ==========================================================================
    // Dashboard
    // ==========================================================================

    renderDashboard(data) {
        const { calls, emails, followUps, overdue, newToday, stats, highIntent } = data;
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

        return `
            <div class="page-header">
                <h1 class="page-title">Today's Actions</h1>
                <p class="page-subtitle">${today}</p>
            </div>

            ${highIntent && highIntent.length ? this.renderHighIntentStrip(highIntent) : ''}

            ${stats ? this.renderStatsSection(stats) : ''}

            ${overdue.length ? this.renderActionCard('⚠️ Overdue', overdue, 'overdue') : ''}
            ${calls.length ? this.renderActionCard('📞 Call', calls, 'call') : ''}
            ${emails.length ? this.renderActionCard('📧 Email', emails, 'email') : ''}
            ${followUps.length ? this.renderActionCard('🔄 Follow Up', followUps, 'followup') : ''}
            
            ${newToday.length ? this.renderNewTodayCard(newToday) : ''}

            ${!overdue.length && !calls.length && !emails.length && !followUps.length ? `
                <div class="empty-state">
                    <div class="empty-state-icon">✨</div>
                    <h3 class="empty-state-title">All caught up!</h3>
                    <p>No actions scheduled for today.</p>
                </div>
            ` : ''}
        `;
    },

    renderHighIntentStrip(contacts) {
        const now = new Date();

        const rows = contacts.map(c => {
            const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
            const company = c.companies?.name || '';
            const lastTouch = new Date(c.updated_at || c.created_at);
            const daysSince = Math.floor((now - lastTouch) / (1000 * 60 * 60 * 24));
            const urgencyColor = daysSince === 0 ? '#10b981' : daysSince <= 3 ? '#f59e0b' : '#ef4444';
            const urgencyLabel = daysSince === 0 ? 'Today' : daysSince === 1 ? '1d ago' : `${daysSince}d ago`;

            return `
                <a href="#/contact/${c.id}" style="
                    display: flex; align-items: center; gap: 12px;
                    padding: 9px 12px; border-radius: 8px;
                    text-decoration: none; color: inherit;
                    transition: background 0.12s;
                " onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
                    <div style="
                        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
                        background: ${urgencyColor};
                    "></div>
                    <span style="font-weight: 600; font-size: 13px; min-width: 140px;">${name}</span>
                    <span style="font-size: 12px; color: #94a3b8; flex: 1;">${company}</span>
                    <span style="font-size: 11px; color: ${urgencyColor}; font-weight: 500; white-space: nowrap;">${urgencyLabel}</span>
                </a>
            `;
        }).join('');

        return `
            <div style="margin-bottom: 20px; border: 1.5px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <button onclick="
                    const body = document.getElementById('hiBody');
                    const arrow = document.getElementById('hiArrow');
                    const open = body.style.display !== 'none';
                    body.style.display = open ? 'none' : 'block';
                    arrow.textContent = open ? '›' : '⌄';
                " style="
                    width: 100%; display: flex; align-items: center; justify-content: space-between;
                    padding: 12px 16px; background: white; border: none; cursor: pointer;
                    font-size: 13px;
                ">
                    <span style="font-weight: 700; color: #1e293b; letter-spacing: 0.02em">🔥 HIGH INTENT &nbsp;<span style="color:#94a3b8; font-weight:400;">${contacts.length} prospects</span></span>
                    <span id="hiArrow" style="font-size: 18px; color: #94a3b8; line-height:1;">›</span>
                </button>
                <div id="hiBody" style="display:none; border-top: 1px solid #f1f5f9; padding: 4px 4px;">
                    ${rows}
                </div>
            </div>
        `;
    },

    renderStatsSection(stats) {
        const outcomeLabels = {
            'connected': '✅ Connected',
            'voicemail': '📞 Voicemail',
            'no_answer': '📵 No Answer',
            'scheduled_meeting': '📅 Meeting Set',
            'not_interested': '❌ Not Interested',
            'email_sent': '📧 Email Sent',
            'email_reply': '💬 Got Reply',
            'follow_up_needed': '🔄 Follow Up'
        };

        const outcomeSummary = Object.entries(stats.outcomeCounts || {})
            .map(([key, count]) => `<span class="stat-outcome">${outcomeLabels[key] || key}: <strong>${count}</strong></span>`)
            .join('');

        const cardStyle = `cursor:pointer; transition: box-shadow 0.15s, transform 0.15s;`;
        const cardHover = `onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)';this.style.transform='translateY(-2px)'" onmouseout="this.style.boxShadow='';this.style.transform=''"`;

        return `
            <div class="stats-grid">
                <div class="stat-card" style="${cardStyle}" ${cardHover} onclick="window.crmRouter.navigate('/contacts')">
                    <div class="stat-number">${stats.totalContacts}</div>
                    <div class="stat-label">Total Leads</div>
                </div>
                <div class="stat-card" style="${cardStyle}" ${cardHover} onclick="window.crmApp.filterActivityLogByType('call')">
                    <div class="stat-number">${stats.activityCounts?.call || 0}</div>
                    <div class="stat-label">Calls Made</div>
                </div>
                <div class="stat-card" style="${cardStyle}" ${cardHover} onclick="window.crmApp.filterActivityLogByType('linkedin')">
                    <div class="stat-number">${stats.activityCounts?.linkedin || 0}</div>
                    <div class="stat-label">LinkedIn</div>
                </div>
                <div class="stat-card" style="${cardStyle}" ${cardHover} onclick="window.crmApp.filterActivityLogByType('email')">
                    <div class="stat-number">${stats.activityCounts?.email || 0}</div>
                    <div class="stat-label">Emails Sent</div>
                </div>
                <div class="stat-card" style="${cardStyle}" ${cardHover} onclick="window.crmApp.filterActivityLogByType('meeting')">
                    <div class="stat-number">${stats.activityCounts?.meeting || 0}</div>
                    <div class="stat-label">Meetings</div>
                </div>
            </div>
            ${outcomeSummary ? `
                <div class="card" style="margin-bottom: 16px;">
                    <div class="card-header">
                        <h3 class="card-title">📊 Outcome Summary</h3>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 12px; padding: 8px 0;">
                        ${outcomeSummary}
                    </div>
                </div>
            ` : ''}
        `;
    },

    renderActionCard(title, contacts, type) {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">${title} <span class="card-count">${contacts.length}</span></h3>
                </div>
                <div class="action-list">
                    ${contacts.map(c => this.renderActionItem(c, type)).join('')}
                </div>
            </div>
        `;
    },

    renderActionItem(contact, type) {
        const companyName = contact.companies?.name || contact.company || '';
        const daysAgo = contact.next_action_date
            ? Math.floor((new Date() - new Date(contact.next_action_date + 'T12:00:00')) / (1000 * 60 * 60 * 24))
            : 0;
        const overdueText = daysAgo > 0 ? ` • ${daysAgo} day${daysAgo > 1 ? 's' : ''} ago` : '';
        const contactName = `${contact.first_name} ${contact.last_name}`;
        const actionType = contact.next_action || 'Call';

        return `
            <div class="action-item" onclick="window.crmApp.goToContact('${contact.id}')">
                <div class="action-item-left">
                    <div class="action-item-info">
                        <span class="action-item-name">${contact.first_name} ${contact.last_name}</span>
                        <span class="action-item-meta">
                            ${companyName}${companyName && contact.source ? ' • ' : ''}${this.renderSourceBadgeInline(contact.source)}${overdueText}
                        </span>
                    </div>
                </div>
                <div class="action-item-actions">
                    <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); window.crmApp.openLogOutcome('${contact.id}', '${contactName.replace(/'/g, "\\'")}', '${actionType}')">Log</button>
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); window.crmApp.showSnooze('${contact.id}')">Snooze</button>
                </div>
            </div>
        `;
    },

    renderNewTodayCard(contacts) {
        const bySource = {};
        contacts.forEach(c => {
            const source = c.source || 'Other';
            if (!bySource[source]) bySource[source] = 0;
            bySource[source]++;
        });

        const sourceSummary = Object.entries(bySource)
            .map(([source, count]) => `${count} ${source}`)
            .join(' • ');

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">📥 New Today <span class="card-count">${contacts.length}</span></h3>
                </div>
                <p style="color: var(--color-text-muted); font-size: 14px;">${sourceSummary}</p>
            </div>
        `;
    },

    // ==========================================================================
    // Contacts List
    // ==========================================================================

    renderContactsList(contacts, filters = {}) {
        return `
            <div class="page-header">
                <h1 class="page-title">All Contacts</h1>
                <p class="page-subtitle">${contacts.length} contact${contacts.length !== 1 ? 's' : ''}</p>
            </div>

            <div class="filters">
                <input type="text" class="search-input" placeholder="Search name or email..." 
                    value="${filters.search || ''}" 
                    onkeyup="window.crmApp.handleSearch(event)">
                <select class="filter-select" onchange="window.crmApp.handleSourceFilter(this.value)">
                    <option value="">All Sources</option>
                    ${window.CRM_CONFIG.SOURCES.map(s => `
                        <option value="${s}" ${filters.source === s ? 'selected' : ''}>${s}</option>
                    `).join('')}
                </select>
                <select class="filter-select" onchange="window.crmApp.handleStatusFilter(this.value)">
                    <option value="">All Statuses</option>
                    ${window.CRM_CONFIG.STATUSES.map(s => `
                        <option value="${s}" ${filters.status === s ? 'selected' : ''}>${s}</option>
                    `).join('')}
                </select>
                <select class="filter-select" id="eventTagFilter" onchange="window.crmApp.handleEventTagFilter(this.value)">
                    <option value="">All Campaigns</option>
                </select>
            </div>

            ${filters.event_tag ? `
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px 16px; background: #f5f3ff; border-radius: 8px; border: 1px solid #ddd6fe;">
                    <span style="font-size: 14px; color: #7c3aed; font-weight: 600;">🏷️ Showing: ${filters.event_tag}</span>
                    <span style="font-size: 13px; color: #6b7280;">${contacts.length} contacts</span>
                    <button onclick="window.crmApp.pushTaggedToBrevo()" 
                        style="margin-left: auto; background: #7c3aed; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">
                        📤 Push All to Brevo List
                    </button>
                </div>
            ` : ''}

            <div class="card">
                ${contacts.length ? `
                    <table class="contacts-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Company</th>
                                <th>Source</th>
                                <th>Status</th>
                                <th>Next Action</th>
                                <th>Added</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${contacts.map(c => this.renderContactRow(c)).join('')}
                        </tbody>
                    </table>
                ` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">👤</div>
                        <h3 class="empty-state-title">No contacts found</h3>
                        <p>Add your first contact!</p>
                    </div>
                `}
            </div>
        `;
    },

    renderContactRow(contact) {
        const companyName = contact.companies?.name || '';
        const added = new Date(contact.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const nextAction = contact.next_action && contact.next_action !== 'None'
            ? `${contact.next_action}${contact.next_action_date ? ' - ' + new Date(contact.next_action_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`
            : '—';

        return `
            <tr onclick="window.crmApp.goToContact('${contact.id}')">
                <td class="contact-name">${contact.high_intent ? '<span title="High Intent" style="margin-right:4px;">🔥</span>' : ''}${contact.first_name} ${contact.last_name}${contact.brevo_synced ? ' <span style="color: #059669; font-size: 11px;" title="In Brevo">✓ Brevo</span>' : ''}${contact.event_tag ? ` <span style="background: #f5f3ff; color: #7c3aed; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 500;">${contact.event_tag}</span>` : ''}</td>
                <td>${companyName}</td>
                <td>${this.renderSourceBadge(contact.source)}</td>
                <td>${this.renderStatusBadge(contact.status)}</td>
                <td>${nextAction}</td>
                <td style="color: var(--color-text-muted)">${added}</td>
            </tr>
        `;
    },

    // ==========================================================================
    // Contact Detail
    // ==========================================================================

    renderContactDetail(contact) {
        const companyName = contact.companies?.name || '';

        return `
            <div class="contact-detail">
                <a href="#/contacts" class="btn btn-ghost btn-sm" style="margin-bottom: 16px;">← Back to Contacts</a>
                
                <div class="card">
                    <div class="contact-detail-header">
                        <div>
                            <h1 class="contact-detail-name">${contact.first_name} ${contact.last_name}</h1>
                            ${contact.job_title ? `<p class="contact-detail-title">${contact.job_title}</p>` : ''}
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <button
                                id="highIntentBtn"
                                onclick="window.crmApp.toggleHighIntent('${contact.id}', ${!contact.high_intent})"
                                title="${contact.high_intent ? 'Remove from High Intent' : 'Mark as High Intent'}"
                                style="
                                    background: ${contact.high_intent ? '#fff7ed' : 'white'};
                                    border: 1.5px solid ${contact.high_intent ? '#f97316' : '#e2e8f0'};
                                    border-radius: 8px; padding: 6px 12px;
                                    font-size: 14px; cursor: pointer;
                                    transition: all 0.15s;
                                    color: ${contact.high_intent ? '#ea580c' : '#94a3b8'};
                                    font-weight: 600;
                                "
                            >${contact.high_intent ? '🔥 High Intent' : '☆ Mark Priority'}</button>
                            <button class="btn btn-secondary btn-sm" onclick="window.crmApp.editContact('${contact.id}')">Edit</button>
                        </div>
                    </div>

                    <!-- Contact Info Grid -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 20px 0; padding: 16px; background: #f8fafc; border-radius: 8px;">
                        ${companyName ? `
                            <div>
                                <span style="font-size: 12px; color: #64748b; display: block;">Company</span>
                                <strong style="font-size: 15px;">${companyName}</strong>
                            </div>
                        ` : ''}
                        ${contact.email ? `
                            <div>
                                <span style="font-size: 12px; color: #64748b; display: block;">Email</span>
                                <a href="mailto:${contact.email}" style="font-size: 15px;">${contact.email}</a>
                            </div>
                        ` : ''}
                        ${contact.phone ? `
                            <div>
                                <span style="font-size: 12px; color: #64748b; display: block;">Phone</span>
                                <a href="tel:${contact.phone}" style="font-size: 15px;">${contact.phone}</a>
                            </div>
                        ` : ''}
                        ${contact.linkedin_url ? `
                            <div>
                                <span style="font-size: 12px; color: #64748b; display: block;">LinkedIn</span>
                                <a href="${contact.linkedin_url}" target="_blank" style="font-size: 15px;">View Profile ↗</a>
                            </div>
                        ` : ''}
                    </div>

                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        ${this.renderSourceBadge(contact.source)}
                        ${this.renderStatusBadge(contact.status)}
                        ${contact.brevo_synced
                ? `<span class="badge" style="background: #d1fae5; color: #047857;">✓ In Brevo (${contact.brevo_tag || 'synced'})</span>`
                : (window.crmAuth?.isAdmin()
                    ? (contact.email
                        ? `<div style="display: flex; gap: 8px; align-items: center;">
                            <select id="brevoListSelect" class="filter-select" style="font-size: 13px; padding: 4px 8px;">
                                <option value="19">🏥 HIMSS 26</option>
                                <option value="15">Met in Person</option>
                                <option value="16">Direct Call</option>
                                <option value="17">LinkedIn</option>
                                <option value="18">Referral</option>
                                <option value="14">Spark Lead</option>
                            </select>
                            <button class="btn btn-sm btn-secondary" onclick="window.crmApp.pushToBrevo('${contact.id}')">Push to Brevo →</button>
                        </div>`
                        : `<span style="font-size: 12px; color: #94a3b8; font-style: italic;">Add email to sync to Brevo</span>`)
                    : '')
            }
                    </div>
                </div>

                ${contact.problem ? `
                    <div class="card">
                        <div class="contact-section">
                            <h4 class="contact-section-title">Problem</h4>
                            <p class="contact-problem">"${contact.problem}"</p>
                        </div>
                    </div>
                ` : ''}

                ${contact.intent_reason ? `
                    <div class="card">
                        <div class="contact-section">
                            <h4 class="contact-section-title">🎯 Intent Reason</h4>
                            <p style="margin-bottom: 12px; line-height: 1.6;">${contact.intent_reason}</p>
                            ${contact.source_links ? `
                                <div style="margin-top: 12px;">
                                    <span style="font-size: 12px; color: var(--color-text-muted); display: block; margin-bottom: 8px;">Sources:</span>
                                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                        ${contact.source_links.split(',').map((link, i) => {
                const url = link.trim();
                if (!url) return '';
                const domain = url.replace(/https?:\/\//, '').split('/')[0];
                return `<a href="${url}" target="_blank" class="badge" style="text-decoration: none; background: #f0f9ff; color: #0284c7;">${domain} ↗</a>`;
            }).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}

                <div class="card">
                    <div class="contact-section">
                        <h4 class="contact-section-title">Next Action</h4>
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <select id="nextActionSelect" class="filter-select" style="flex: 1;">
                                <option value="">No action</option>
                                ${window.CRM_CONFIG.NEXT_ACTIONS.filter(a => a !== 'None').map(a => `
                                    <option value="${a}" ${contact.next_action === a ? 'selected' : ''}>${a}</option>
                                `).join('')}
                            </select>
                            <input type="date" id="nextActionDate" class="filter-select" 
                                value="${contact.next_action_date || ''}" style="flex: 1;">
                            <button class="btn btn-primary btn-sm" onclick="window.crmApp.updateNextAction('${contact.id}')">Update</button>
                            <button class="btn btn-success btn-sm" onclick="window.crmApp.openLogOutcome('${contact.id}', '${contact.first_name} ${contact.last_name}', '${contact.next_action || 'meeting'}')">Log Activity</button>
                        </div>
                    </div>
                </div>

                <!-- Activity Timeline -->
                <div class="card">
                    <div class="contact-section">
                        <h4 class="contact-section-title">📅 Activity Timeline</h4>
                        <div id="activityTimeline" style="margin-top: 16px;">
                            <p style="color: var(--color-text-muted); font-style: italic;">Loading activities...</p>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="contact-section">
                        <h4 class="contact-section-title">Notes</h4>
                        <div id="voiceNotesContainer"></div>
                        ${this.renderNotes(contact.notes)}
                        <form onsubmit="window.crmApp.addNote(event, '${contact.id}')" style="margin-top: 16px;">
                            <div class="form-group" style="margin-bottom: 12px;">
                                <textarea name="note" rows="2" placeholder="Add a note..."></textarea>
                            </div>
                            <button type="submit" class="btn btn-secondary btn-sm">+ Add Note</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    },

    renderNotes(notes) {
        if (!notes) {
            return '<p style="color: var(--color-text-muted); font-style: italic;">No notes yet.</p>';
        }

        // Split notes by double newline (each note entry)
        const entries = notes.split('\n\n').filter(n => n.trim());

        return `
            <div class="contact-notes">
                ${entries.map(entry => {
            const [datePart, ...rest] = entry.split(': ');
            const noteText = rest.join(': ');
            return `
                        <div class="note-entry">
                            <div class="note-date">${datePart}</div>
                            <div>${noteText}</div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    },

    // ==========================================================================
    // Badges
    // ==========================================================================

    renderSourceBadge(source) {
        if (!source) return '';
        const classes = {
            'Website (Spark)': 'badge-spark',
            'Met In Person': 'badge-met',
            'Clay Import': 'badge-clay'
        };
        return `<span class="badge ${classes[source] || ''}">${source}</span>`;
    },

    renderSourceBadgeInline(source) {
        return source || '';
    },

    renderStatusBadge(status) {
        if (!status) return '';
        const classes = {
            'New': 'badge-new',
            'Active': 'badge-active',
            'Won': 'badge-won',
            'Lost': 'badge-lost',
            'Nurture': 'badge-nurture',
            'Not a Fit': 'badge-notafit'
        };
        return `<span class="badge ${classes[status] || ''}">${status}</span>`;
    },

    // ==========================================================================
    // Loading & Error States
    // ==========================================================================

    renderLoading() {
        return '<div class="loading">Loading</div>';
    },

    renderError(message) {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <h3 class="empty-state-title">Error</h3>
                <p>${message}</p>
            </div>
        `;
    },

    // ==========================================================================
    // Activity Log
    // ==========================================================================

    renderActivityLog(activities, filters = {}, totalCounts = null) {
        const activePreset = filters.preset || 'all';
        const dateFrom = filters.dateFrom || '';
        const dateTo = filters.dateTo || '';

        // Use server-side counts if provided (bypasses 1000-row limit), else fall back to array count
        let stats;
        if (totalCounts) {
            stats = totalCounts;
        } else {
            stats = { call: 0, email: 0, meeting: 0, linkedin: 0 };
            (activities || []).forEach(a => {
                const type = a.activity_type || 'note';
                if (stats[type] !== undefined) stats[type]++;
            });
        }

        // Group by date
        const grouped = {};
        (activities || []).forEach(a => {
            const date = new Date(a.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(a);
        });

        const icons = {
            'call': '📞', 'email': '✉️', 'meeting': '🤝',
            'linkedin': '🔗', 'note': '📝', 'status_change': '🔄'
        };

        const outcomeLabels = {
            'no_answer': 'No Answer', 'left_voicemail': 'Left Voicemail',
            'connected': 'Connected', 'scheduled_meeting': 'Scheduled Meeting',
            'not_interested': 'Not Interested', 'sent': 'Sent',
            'replied': 'Replied', 'bounced': 'Bounced',
            'completed': 'Completed', 'no_show': 'No Show',
            'rescheduled': 'Rescheduled', 'other': 'Other'
        };

        const activityRows = Object.entries(grouped).map(([date, items]) => `
            <div class="activity-log-date-group">
                <div class="activity-log-date-header">${date}</div>
                ${items.map(a => {
            const time = new Date(a.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const icon = icons[a.activity_type] || '📝';
            const typeLabel = (a.activity_type || 'note').charAt(0).toUpperCase() + (a.activity_type || 'note').slice(1).replace('_', ' ');
            const outcomeLabel = a.outcome ? outcomeLabels[a.outcome] || a.outcome : '';
            return `
                        <div class="activity-log-item">
                            <div class="activity-log-icon">${icon}</div>
                            <div class="activity-log-content">
                                <div class="activity-log-header">
                                    <span class="activity-log-type">${typeLabel}${outcomeLabel ? ` — ${outcomeLabel}` : ''}</span>
                                    <span class="activity-log-time">${time}</span>
                                </div>
                                <a href="#/contact/${a.contact_id}" class="activity-log-contact">${a.contact_name}${a.contact_company ? ` · ${a.contact_company}` : ''}</a>
                                ${a.notes ? `<div class="activity-log-notes">${a.notes}</div>` : ''}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `).join('');

        return `
            <div class="page-header">
                <h1 class="page-title">📋 Activity Log</h1>
                <p class="page-subtitle">Everything you've done, filterable by date</p>
            </div>

            <div class="activity-log-filters">
                <div class="activity-log-presets">
                    <button class="activity-preset-btn ${activePreset === 'today' ? 'active' : ''}" onclick="window.crmApp.filterActivities('today')">Today</button>
                    <button class="activity-preset-btn ${activePreset === 'week' ? 'active' : ''}" onclick="window.crmApp.filterActivities('week')">This Week</button>
                    <button class="activity-preset-btn ${activePreset === 'month' ? 'active' : ''}" onclick="window.crmApp.filterActivities('month')">This Month</button>
                    <button class="activity-preset-btn ${activePreset === 'all' ? 'active' : ''}" onclick="window.crmApp.filterActivities('all')">All Time</button>
                </div>
                <div class="activity-log-custom">
                    <input type="date" id="activityDateFrom" value="${dateFrom}" onchange="window.crmApp.filterActivitiesCustom()">
                    <span style="color: var(--color-text-muted);">to</span>
                    <input type="date" id="activityDateTo" value="${dateTo}" onchange="window.crmApp.filterActivitiesCustom()">
                </div>
            </div>

            <div class="stats-grid" style="margin-bottom: 16px;">
                <div class="stat-card">
                    <div class="stat-number">${stats.call}</div>
                    <div class="stat-label">Calls</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.linkedin}</div>
                    <div class="stat-label">LinkedIn</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.email}</div>
                    <div class="stat-label">Emails</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.meeting}</div>
                    <div class="stat-label">Meetings</div>
                </div>
            </div>

            <div class="card">
                ${activities.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <h3 class="empty-state-title">No activities found</h3>
                        <p>Try a different date range.</p>
                    </div>
                ` : `
                    ${activities.length >= 100 && activePreset === 'all' ? `
                        <div style="padding: 10px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
                            Showing most recent 100 of ${(stats.call||0)+(stats.email||0)+(stats.linkedin||0)+(stats.meeting||0)} activities. Use date filters to see specific periods.
                        </div>
                    ` : ''}
                    ${activityRows}
                `}
            </div>
        `;
    }
};

// Make globally available
window.CRMComponents = CRMComponents;
