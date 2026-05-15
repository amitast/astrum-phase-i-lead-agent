export interface SourceRecord {
  URL__c: string;
  Publisher__c: string;
  Confidence_Tier__c: string;
  Publish_Date__c: string | null;
  Fetch_Date__c: string;
  Raw_Payload__c: string;
  Verification_Status__c: 'Unverified';
}

export interface SignalRecord {
  Target_Company__c: string;   // Account.Id (resolved after upsert)
  Source__c: string;           // Source__c.Id (resolved after upsert)
  Signal_Type__c: string;
  Signal_Date__c: string;
  Status__c: 'New';
  Modality__c: string;
  Therapeutic_Area__c: string;
  Company_Stage__c: string;
  Confidence__c: string;
  Classification_Source__c: 'Worker-Deterministic';
  Signal_Summary__c: string;
  Dedupe_Hash__c: string;
  Phase_I_Readiness_Weight__c: number;
}

export interface AccountUpsertRecord {
  Lead_Agent_External_Id__c: string;
  Name: string;
  RecordTypeId: string;        // Astrum_Target_Biotech RecordType Id
  Is_US_HQ__c: boolean;
  HQ_Country__c: string;
  Lead_Agent_Status__c: 'Active';
  Lead_Agent_TA__c: string;
  Modality__c: string;
  Company_Stage__c: string;
}

export interface NormalisedSignal {
  externalId: string;           // dedupe hash
  companyName: string;
  companyExternalId: string;    // hash of company name for Account upsert
  isUsHq: boolean;
  hqCountry: string;
  signalType: string;
  signalDate: string;           // ISO date
  modality: string;
  therapeuticArea: string;
  companyStage: string;
  confidence: string;
  summary: string;
  phaseIReadinessWeight: number;
  sourceUrl: string;
  sourcePublisher: string;
  sourceConfidenceTier: string;
  sourcePublishDate: string | null;
  rawPayload: string;
}
