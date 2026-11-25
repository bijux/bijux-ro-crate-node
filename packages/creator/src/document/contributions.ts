/** Creator-owned editing slice of the pinned BIA model, not a validation schema. */
export const contributionKinds = ['contributor','affiliation','publication','grant','funding-body'] as const
export type ContributionKind = typeof contributionKinds[number]
export type ContributionField = 'address' | 'website' | 'email' | 'authorNames' | 'doi' | 'pubmedId' | 'identifier'
export type StudyRelationship = 'author' | 'relatedPublication' | 'funding'
export type ContributionRelationship = 'memberOf' | 'funder'
export const contributionTypes: Record<ContributionKind, readonly string[]> = {
  contributor:['Person','bia:Contributor'], affiliation:['bia:Affiliation'], publication:['bia:Publication'], grant:['bia:Grant'], 'funding-body':['bia:FundingBody'],
}
export const contributionFields: Record<ContributionKind, readonly string[]> = {
  contributor:['name','address','website','email'], affiliation:['name','address','website'], publication:['name','authorNames','doi','pubmedId'], grant:['name','identifier'], 'funding-body':['name','identifier'],
}
export const contributionTerms: Record<StudyRelationship | ContributionRelationship | ContributionField | 'fundingStatement' | 'role', {'@id':string; '@container'?:'@set'}> = {
  author:{'@id':'schema:author','@container':'@set'}, relatedPublication:{'@id':'bia:relatedPublication','@container':'@set'}, funding:{'@id':'schema:funding','@container':'@set'},
  role:{'@id':'bia:role','@container':'@set'},
  memberOf:{'@id':'schema:memberOf','@container':'@set'}, funder:{'@id':'schema:funder','@container':'@set'},
  address:{'@id':'schema:address'}, website:{'@id':'bia:website'}, email:{'@id':'schema:email'}, authorNames:{'@id':'bia:authorNames'}, doi:{'@id':'bia:doi'}, pubmedId:{'@id':'bia:pubmedId'}, identifier:{'@id':'schema:identifier'}, fundingStatement:{'@id':'bia:fundingStatement'},
}
