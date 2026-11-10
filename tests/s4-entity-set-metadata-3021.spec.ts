import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { entitySetFields } from '../lib/s4-entity-set-metadata';

// Fassung 1.1 (privacy policy, terms, trust page): the tenant check reads no record and
// no count. Owner decision 22.10.2026: the entity-set check reads the service metadata only.
const V2 = `<edmx:Edmx><edmx:DataServices><Schema Namespace="API_BUSINESS_PARTNER">
<EntityType Name="A_BusinessPartnerType"><Key><PropertyRef Name="BusinessPartner"/></Key>
<Property Name="BusinessPartner" Type="Edm.String"/><Property Name="BusinessPartnerName" Type="Edm.String"/></EntityType>
<EntityContainer Name="C"><EntitySet Name="A_BusinessPartner" EntityType="API_BUSINESS_PARTNER.A_BusinessPartnerType"/></EntityContainer>
</Schema></edmx:DataServices></edmx:Edmx>`;

test('the fields come from the metadata document, never from a record', () => {
  expect(entitySetFields(V2, 'A_BusinessPartner')).toEqual({
    entityType: 'API_BUSINESS_PARTNER.A_BusinessPartnerType',
    fields: ['BusinessPartner', 'BusinessPartnerName'],
  });
  expect(entitySetFields(V2, 'A_Supplier')).toBeNull();
});

test('the route asks for $metadata only — no $top, no count, no record in the answer', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'test-s4-odata-read', 'route.ts'), 'utf8');
  expect(src).toContain('/$metadata`');
  expect(src).not.toMatch(/\$top=|\$inlinecount|recordCount|__count/);
});
