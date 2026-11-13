import { Injectable } from '@nestjs/common';
import { TicketCategory } from '@prisma/client';

export interface KBSection {
  category: TicketCategory;
  title: string;
  policy: string;
  resolutionTimeline: string;
  sampleQuery: string;
  sampleResolution: string;
}

@Injectable()
export class KnowledgeBaseService {
  readonly companyOverview = `
BookLeaf Publishing is a self-publishing company operating in India and the US.
Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium with marketing/distribution add-ons).
Services: Cover design, typesetting, ISBN assignment, printing, distribution, and royalty management.
Facilities: In-house printing and warehouse located in Delhi. Print partners include Repro India and Epitome Books.
`;

  readonly toneGuidelines = `
BookLeaf Communication Tone Guidelines:
- Always empathetic and professional. Authors are our partners, not customers to be managed.
- Acknowledge the author's concern genuinely before jumping to solutions.
- Be specific: Include actual numbers, dates, amounts, and statuses wherever possible rather than vague reassurances.
- If something is BookLeaf's fault (delayed royalties, ISBN error), own it directly with no corporate deflection.
- If the issue requires escalation or investigation, give a clear timeline ("Our team will look into this and get back to you within 48 hours") rather than open-ended promises.
- Always end with a clear next step for the author and/or the BookLeaf team.
`;

  readonly categoryKnowledge: Record<TicketCategory, KBSection> = {
    ROYALTY_AND_PAYMENTS: {
      category: 'ROYALTY_AND_PAYMENTS',
      title: 'Royalty & Payments Policy',
      policy: `
- Royalty Split: 80/20 split (80% net profit to author, 20% to BookLeaf).
- Net profit calculation = MRP minus printing cost, platform commission (Amazon/Flipkart), and shipping charges.
- Payout Schedule: Calculated quarterly and paid within 45 days of quarter ending.
- Threshold: Minimum ₹1,000. If accumulated royalties are below ₹1,000, they roll over to the next quarter.
- Payment Method: Direct bank transfer to the account linked in author's dashboard.
- Author Dashboard: Shows detailed platform-wise breakdown (Amazon India, Flipkart, BookLeaf Store, etc.).
`,
      resolutionTimeline: '48 hours for overdue payment escalation / royalty statement audit',
      sampleQuery: 'I published my book 4 months ago and still haven’t received any royalty. What’s going on?',
      sampleResolution: 'Acknowledge frustration. Explain quarterly cycle + 45-day payout window. Check if bank details are linked. Provide exact next payout date. If genuinely overdue, escalate with 48h resolution timeline.',
    },
    ISBN_AND_METADATA_ISSUES: {
      category: 'ISBN_AND_METADATA_ISSUES',
      title: 'ISBN & Metadata Policy',
      policy: `
- Assignment: Every book published through BookLeaf receives a unique ISBN assigned by BookLeaf under BookLeaf imprint.
- Independent ISBNs: Authors wanting their own imprint must procure ISBN independently.
- Errors: Duplicate ISBN, incorrect title/author linkage on platform catalog is treated as high-priority.
- Escalation: Directly escalated to production team within 24-48 hours.
`,
      resolutionTimeline: '48 hours for ISBN catalog synchronization and catalog correction',
      sampleQuery: 'My book is showing a different ISBN on Amazon than what’s on the physical copy.',
      sampleResolution: 'Treat as high priority. Acknowledge this is a serious data issue. Confirm escalating to production team immediately with a 48-hour resolution timeline.',
    },
    PRINTING_AND_QUALITY: {
      category: 'PRINTING_AND_QUALITY',
      title: 'Printing & Quality Policy',
      policy: `
- Production: In-house printing in Delhi handles most orders. Overflow/specific formats handled by Repro India or Epitome Books.
- Turnaround: Standard print turnaround is 5–7 business days from order confirmation.
- Defect Policy: Free reprint arranged after verification if author reports misprints, binding defects, or color inconsistency.
- Requirement: Author must provide photos of the defective copies for quality team verification.
`,
      resolutionTimeline: '5–7 business days for reprint dispatch after photo verification',
      sampleQuery: 'I received my author copies and the print quality is terrible. The images are blurry and pages are misaligned.',
      sampleResolution: 'Apologise sincerely. Ask author to share photos of defective copies. Confirm BookLeaf will arrange a free reprint once verified within 5-7 business days.',
    },
    DISTRIBUTION_AND_AVAILABILITY: {
      category: 'DISTRIBUTION_AND_AVAILABILITY',
      title: 'Distribution & Availability Policy',
      policy: `
- Channels: Amazon India, Flipkart, Amazon US, Amazon UK, and BookLeaf Store.
- Listing Timeline: New listings go live within 7–10 business days after publication is complete.
- Stock Sync: If showing "Currently Unavailable" on Amazon/Flipkart, it is typically a stock feed sync issue.
- Sync Fix: BookLeaf operations can trigger a catalog/inventory re-sync within 24–48 hours.
`,
      resolutionTimeline: '24–48 hours for platform catalog inventory re-sync',
      sampleQuery: 'My book is published but it’s showing as "Currently Unavailable" on Amazon.',
      sampleResolution: 'Explain stock sync issue. Confirm triggering re-sync with distribution team. Set expectation: 24-48 hours to be back live.',
    },
    BOOK_STATUS_AND_PRODUCTION_UPDATES: {
      category: 'BOOK_STATUS_AND_PRODUCTION_UPDATES',
      title: 'Production Stages & Status Policy',
      policy: `
- Stages: Manuscript Received -> Editing (if opted) -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live.
- Author Updates: Authors updated at each milestone via email.
- Common Bottlenecks: Delays typically occur at Cover Design (waiting for author feedback) and Proofreading (author revisions).
- Communication rule: Never blame author; frame delays collaboratively with updated timeline.
`,
      resolutionTimeline: '24-48 hours for detailed production team check and milestone update',
      sampleQuery: 'It’s been 3 weeks and my book is still in typesetting. When will it be done?',
      sampleResolution: 'Check actual stage in system. If delayed, be honest and transparent. Provide specific updated target date. Frame collaboratively.',
    },
    GENERAL_INQUIRY: {
      category: 'GENERAL_INQUIRY',
      title: 'General Support & Account Policies',
      policy: `
- Scope: Author account management, biography updates, package queries, retail discounts.
- Metadata updates: Description or price changes can be submitted via author portal or email; reflects on retail channels within 3–5 business days.
`,
      resolutionTimeline: '3–5 business days for retail metadata propagation',
      sampleQuery: 'Can I update the description of my book on Amazon after it’s already live?',
      sampleResolution: 'Confirm yes. Explain metadata updates reflect on Amazon/Flipkart within 3-5 business days.',
    },
  };

  /**
   * Cost-Aware context slice: Returns ONLY the relevant category policy and tone guidelines
   */
  getKnowledgeSliceForCategory(category: TicketCategory): string {
    const section = this.categoryKnowledge[category] || this.categoryKnowledge.GENERAL_INQUIRY;

    return `
=== BOOKLEAF RELEVANT POLICY: ${section.title} ===
${section.policy}
Expected Resolution Timeline: ${section.resolutionTimeline}
Reference Case:
- Author Concern: "${section.sampleQuery}"
- Recommended Tone & Action: "${section.sampleResolution}"

=== COMMUNICATION GUIDELINES ===
${this.toneGuidelines}
`.trim();
  }

  getAllSections(): KBSection[] {
    return Object.values(this.categoryKnowledge);
  }
}
