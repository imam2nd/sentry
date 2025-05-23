import {useMemo} from 'react';

import {useFetchOrganizationTags} from 'sentry/actionCreators/tags';
import {
  ItemType,
  type SearchGroup,
} from 'sentry/components/deprecatedSmartSearchBar/types';
import {escapeTagValue} from 'sentry/components/deprecatedSmartSearchBar/utils';
import {IconStar, IconUser} from 'sentry/icons';
import {t} from 'sentry/locale';
import MemberListStore from 'sentry/stores/memberListStore';
import TeamStore from 'sentry/stores/teamStore';
import {useLegacyStore} from 'sentry/stores/useLegacyStore';
import {
  getIssueTitleFromType,
  IssueCategory,
  PriorityLevel,
  type Tag,
  type TagCollection,
  VISIBLE_ISSUE_TYPES,
} from 'sentry/types/group';
import type {Organization} from 'sentry/types/organization';
import type {User} from 'sentry/types/user';
import {escapeIssueTagKey} from 'sentry/utils';
import {SEMVER_TAGS} from 'sentry/utils/discover/fields';
import {
  FieldKey,
  FieldKind,
  IsFieldValues,
  ISSUE_EVENT_PROPERTY_FIELDS,
  ISSUE_FIELDS,
  ISSUE_PROPERTY_FIELDS,
} from 'sentry/utils/fields';
import {Dataset} from 'sentry/views/alerts/rules/metric/types';
import useFetchOrganizationFeatureFlags from 'sentry/views/issueList/utils/useFetchOrganizationFeatureFlags';

type UseFetchIssueTagsParams = {
  org: Organization;
  projectIds: string[];
  enabled?: boolean;
  end?: string;
  includeFeatureFlags?: boolean;
  keepPreviousData?: boolean;
  start?: string;
  statsPeriod?: string | null;
  useCache?: boolean;
};

const PREDEFINED_FIELDS = {
  ...ISSUE_PROPERTY_FIELDS.reduce<TagCollection>((acc, tag) => {
    acc[tag] = {key: tag, name: tag, predefined: true, kind: FieldKind.ISSUE_FIELD};
    return acc;
  }, {}),
  ...ISSUE_EVENT_PROPERTY_FIELDS.reduce<TagCollection>((acc, tag) => {
    acc[tag] = {key: tag, name: tag, predefined: false, kind: FieldKind.EVENT_FIELD};
    return acc;
  }, {}),
};

// "environment" is excluded because it should be handled by the environment page filter
const EXCLUDED_TAGS = ['environment'];

/**
 * Certain field keys may conflict with custom tags. In this case, the tag will be
 * renamed, e.g. `platform` -> `tags[platform]`
 */
const renameConflictingTags = (tags: TagCollection): TagCollection => {
  const renamedTags: TagCollection = {};

  for (const [key, tag] of Object.entries(tags)) {
    const newKey = escapeIssueTagKey(key);
    if (key === newKey) {
      renamedTags[key] = tag;
    } else {
      renamedTags[newKey] = {
        ...tag,
        key: newKey,
        name: newKey,
      };
    }
  }

  return renamedTags;
};

/**
 * Fetches the tags from both the Errors and IssuePlatform dataset
 * and combines them with builtin and predfined tags.
 */
export const useFetchIssueTags = ({
  org,
  projectIds,
  keepPreviousData = false,
  useCache = true,
  enabled = true,
  includeFeatureFlags = false,
  ...statsPeriodParams
}: UseFetchIssueTagsParams) => {
  const {teams} = useLegacyStore(TeamStore);
  const {members} = useLegacyStore(MemberListStore);

  const eventsTagsQuery = useFetchOrganizationTags(
    {
      orgSlug: org.slug,
      projectIds,
      dataset: Dataset.ERRORS,
      useCache,
      enabled,
      keepPreviousData,
      ...statsPeriodParams,
    },
    {}
  );

  const issuePlatformTagsQuery = useFetchOrganizationTags(
    {
      orgSlug: org.slug,
      projectIds,
      dataset: Dataset.ISSUE_PLATFORM,
      useCache,
      enabled,
      keepPreviousData,
      ...statsPeriodParams,
    },
    {}
  );

  // For now, feature flag keys (see `flags` column of the ERRORS dataset) are exposed from the tags endpoint,
  // with query param useFlagsBackend=1. This is used for issue stream search suggestions.
  const featureFlagTagsQuery = useFetchOrganizationFeatureFlags(
    {
      orgSlug: org.slug,
      projectIds,
      useCache,
      enabled: enabled && includeFeatureFlags, // Only make this query if includeFeatureFlags is true.
      keepPreviousData,
      ...statsPeriodParams,
    },
    {}
  );

  const allTags = useMemo(() => {
    const userTeams = teams.filter(team => team.isMember).map(team => `#${team.slug}`);
    const usernames: string[] = members.map(getUsername);
    const nonMemberTeams = teams
      .filter(team => !team.isMember)
      .map(team => `#${team.slug}`);

    const suggestedAssignees: string[] = ['me', 'my_teams', 'none', ...userTeams];

    const assignedValues: SearchGroup[] | string[] = [
      {
        title: t('Suggested Values'),
        type: 'header',
        icon: <IconStar size="xs" />,
        children: suggestedAssignees.map(convertToSearchItem),
      },
      {
        title: t('All Values'),
        type: 'header',
        icon: <IconUser size="xs" />,
        children: [
          ...usernames.map(convertToSearchItem),
          ...nonMemberTeams.map(convertToSearchItem),
        ],
      },
    ];

    const eventsTags: Tag[] = eventsTagsQuery.data || [];
    const issuePlatformTags: Tag[] = issuePlatformTagsQuery.data || [];
    const featureFlagTags: Tag[] = featureFlagTagsQuery.data || [];

    const allTagsCollection: TagCollection = eventsTags.reduce<TagCollection>(
      (acc, tag) => {
        acc[tag.key] = {...tag, kind: FieldKind.TAG};
        return acc;
      },
      {}
    );

    issuePlatformTags.forEach(tag => {
      if (allTagsCollection[tag.key]) {
        allTagsCollection[tag.key]!.totalValues =
          (allTagsCollection[tag.key]!.totalValues ?? 0) + (tag.totalValues ?? 0);
      } else {
        allTagsCollection[tag.key] = {...tag, kind: FieldKind.TAG};
      }
    });

    featureFlagTags.forEach(tag => {
      // Wrap with flags[""]. flags[] is required for the search endpoint and "" is used to escape special characters.
      const key = `flags["${tag.key}"]`;
      if (allTagsCollection[key]) {
        allTagsCollection[key].totalValues =
          (allTagsCollection[key].totalValues ?? 0) + (tag.totalValues ?? 0);
      } else {
        allTagsCollection[key] = {
          ...tag,
          kind: FieldKind.FEATURE_FLAG,
          key, // Update with wrapped key.
        };
      }
    });

    for (const excludedTag of EXCLUDED_TAGS) {
      delete allTagsCollection[excludedTag];
    }

    const renamedTags = renameConflictingTags(allTagsCollection);

    const additionalTags = builtInIssuesFields(renamedTags, assignedValues, [
      'me',
      ...usernames,
    ]);

    return {
      ...renamedTags,
      ...additionalTags,
    };
  }, [
    eventsTagsQuery.data,
    issuePlatformTagsQuery.data,
    featureFlagTagsQuery.data,
    members,
    teams,
  ]);

  return {
    tags: allTags,
    isLoading:
      eventsTagsQuery.isPending ||
      issuePlatformTagsQuery.isPending ||
      featureFlagTagsQuery.isPending,
    isError:
      eventsTagsQuery.isError ||
      issuePlatformTagsQuery.isError ||
      featureFlagTagsQuery.isError,
  };
};

function builtInIssuesFields(
  currentTags: TagCollection,
  assigneeFieldValues: SearchGroup[] | string[] = [],
  bookmarksValues: string[] = []
): TagCollection {
  const semverFields: TagCollection = Object.values(SEMVER_TAGS).reduce<TagCollection>(
    (acc, tag) => {
      return {
        ...acc,
        [tag.key]: {
          predefined: false,
          ...tag,
          kind: FieldKind.EVENT_FIELD,
        },
      };
    },
    {}
  );
  const hasFieldValues = [
    ...Object.values(currentTags).map(tag => tag.key),
    ...Object.values(SEMVER_TAGS).map(tag => tag.key),
  ].sort();

  const tagCollection: TagCollection = {
    [FieldKey.IS]: {
      ...PREDEFINED_FIELDS[FieldKey.IS],
      key: FieldKey.IS,
      name: 'Status',
      values: Object.values(IsFieldValues),
      maxSuggestedValues: Object.values(IsFieldValues).length,
      predefined: true,
    },
    [FieldKey.HAS]: {
      ...PREDEFINED_FIELDS[FieldKey.HAS],
      key: FieldKey.HAS,
      name: 'Has Tag',
      values: hasFieldValues,
      predefined: true,
    },
    [FieldKey.ASSIGNED]: {
      ...PREDEFINED_FIELDS[FieldKey.ASSIGNED],
      key: FieldKey.ASSIGNED,
      name: 'Assigned To',
      values: assigneeFieldValues,
      predefined: true,
    },
    [FieldKey.ASSIGNED_OR_SUGGESTED]: {
      ...PREDEFINED_FIELDS[FieldKey.ASSIGNED_OR_SUGGESTED]!,
      name: 'Assigned or Suggested',
      isInput: true,
      values: assigneeFieldValues,
      predefined: true,
    },
    [FieldKey.BOOKMARKS]: {
      ...PREDEFINED_FIELDS[FieldKey.BOOKMARKS]!,
      name: 'Bookmarked By',
      values: bookmarksValues,
      predefined: true,
    },
    [FieldKey.ISSUE_CATEGORY]: {
      ...PREDEFINED_FIELDS[FieldKey.ISSUE_CATEGORY]!,
      name: 'Issue Category',
      values: [
        IssueCategory.ERROR,
        IssueCategory.PERFORMANCE,
        IssueCategory.REPLAY,
        IssueCategory.CRON,
        IssueCategory.UPTIME,
      ],
      predefined: true,
    },
    [FieldKey.ISSUE_TYPE]: {
      ...PREDEFINED_FIELDS[FieldKey.ISSUE_TYPE]!,
      name: 'Issue Type',
      values: VISIBLE_ISSUE_TYPES.map(value => ({
        icon: null,
        title: value,
        name: value,
        documentation: getIssueTitleFromType(value),
        value,
        type: ItemType.TAG_VALUE,
        children: [],
      })) as SearchGroup[],
      predefined: true,
    },
    [FieldKey.LAST_SEEN]: {
      ...PREDEFINED_FIELDS[FieldKey.LAST_SEEN]!,
      name: 'Last Seen',
      values: [],
      predefined: false,
    },
    [FieldKey.FIRST_SEEN]: {
      ...PREDEFINED_FIELDS[FieldKey.FIRST_SEEN]!,
      name: 'First Seen',
      values: [],
      predefined: false,
    },
    [FieldKey.FIRST_RELEASE]: {
      ...PREDEFINED_FIELDS[FieldKey.FIRST_RELEASE]!,
      name: 'First Release',
      values: ['latest'],
      predefined: true,
    },
    [FieldKey.EVENT_TIMESTAMP]: {
      ...PREDEFINED_FIELDS[FieldKey.EVENT_TIMESTAMP]!,
      name: 'Event Timestamp',
      values: [],
      predefined: true,
    },
    [FieldKey.TIMES_SEEN]: {
      ...PREDEFINED_FIELDS[FieldKey.TIMES_SEEN]!,
      name: 'Times Seen',
      isInput: true,
      // Below values are required or else SearchBar will attempt to get values
      // This is required or else SearchBar will attempt to get values
      values: [],
      predefined: true,
    },
    [FieldKey.ISSUE_PRIORITY]: {
      ...PREDEFINED_FIELDS[FieldKey.ISSUE_PRIORITY]!,
      name: 'Issue Priority',
      values: [PriorityLevel.HIGH, PriorityLevel.MEDIUM, PriorityLevel.LOW],
      predefined: true,
    },
  };

  // Ony include fields that that are part of the ISSUE_FIELDS. This is
  // because we may sometimes have fields that are turned off by removing
  // them from ISSUE_FIELDS
  const filteredCollection = Object.entries(tagCollection).filter(([key]) =>
    ISSUE_FIELDS.includes(key as FieldKey)
  );

  return {
    ...PREDEFINED_FIELDS,
    ...Object.fromEntries(filteredCollection),
    ...semverFields,
  };
}

const getUsername = ({isManaged, username, email}: User) => {
  const uuidPattern = /[0-9a-f]{32}$/;
  // Users created via SAML receive unique UUID usernames. Use
  // their email in these cases, instead.
  if (username && uuidPattern.test(username)) {
    return email;
  }
  return !isManaged && username ? username : email;
};

const convertToSearchItem = (value: string) => {
  const escapedValue = escapeTagValue(value);
  return {
    value: escapedValue,
    desc: value,
    type: ItemType.TAG_VALUE,
  };
};
