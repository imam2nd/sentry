import {Fragment, useCallback, useEffect, useRef, useState} from 'react';
import {css} from '@emotion/react';
import styled from '@emotion/styled';

import starImage from 'sentry-images/spot/banner-star.svg';

import Feature from 'sentry/components/acl/feature';
import {SeerWaitingIcon} from 'sentry/components/ai/SeerIcon';
import {Breadcrumbs as NavigationBreadcrumbs} from 'sentry/components/breadcrumbs';
import {Flex} from 'sentry/components/container/flex';
import {ProjectAvatar} from 'sentry/components/core/avatar/projectAvatar';
import {FeatureBadge} from 'sentry/components/core/badge/featureBadge';
import {Button} from 'sentry/components/core/button';
import {ButtonBar} from 'sentry/components/core/button/buttonBar';
import {Input} from 'sentry/components/core/input';
import AutofixFeedback from 'sentry/components/events/autofix/autofixFeedback';
import {AutofixProgressBar} from 'sentry/components/events/autofix/autofixProgressBar';
import {AutofixSteps} from 'sentry/components/events/autofix/autofixSteps';
import AutofixPreferenceDropdown from 'sentry/components/events/autofix/preferences/autofixPreferenceDropdown';
import {useAiAutofix} from 'sentry/components/events/autofix/useAutofix';
import useDrawer from 'sentry/components/globalDrawer';
import {DrawerBody, DrawerHeader} from 'sentry/components/globalDrawer/components';
import {GroupSummary} from 'sentry/components/group/groupSummary';
import HookOrDefault from 'sentry/components/hookOrDefault';
import ExternalLink from 'sentry/components/links/externalLink';
import Link from 'sentry/components/links/link';
import LoadingIndicator from 'sentry/components/loadingIndicator';
import QuestionTooltip from 'sentry/components/questionTooltip';
import {IconArrow} from 'sentry/icons';
import {t, tct} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import type {Event} from 'sentry/types/event';
import type {Group} from 'sentry/types/group';
import type {Project} from 'sentry/types/project';
import {getShortEventId} from 'sentry/utils/events';
import useRouteAnalyticsParams from 'sentry/utils/routeAnalytics/useRouteAnalyticsParams';
import useOrganization from 'sentry/utils/useOrganization';
import {MIN_NAV_HEIGHT} from 'sentry/views/issueDetails/streamline/eventTitle';
import {useAiConfig} from 'sentry/views/issueDetails/streamline/hooks/useAiConfig';
import {SeerNotices} from 'sentry/views/issueDetails/streamline/sidebar/seerNotices';

interface AutofixStartBoxProps {
  groupId: string;
  onSend: (message: string) => void;
}

function AutofixStartBox({onSend, groupId}: AutofixStartBoxProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(message);
  };

  return (
    <Wrapper>
      <ScaleContainer>
        <StyledArrow direction="down" size="sm" />
        <Container>
          <AutofixStartText>
            <BackgroundStar
              src={starImage}
              style={{
                width: '20px',
                height: '20px',
                right: '5%',
                top: '20%',
                transform: 'rotate(15deg)',
              }}
            />
            <BackgroundStar
              src={starImage}
              style={{
                width: '16px',
                height: '16px',
                right: '35%',
                top: '40%',
                transform: 'rotate(45deg)',
              }}
            />
            <BackgroundStar
              src={starImage}
              style={{
                width: '14px',
                height: '14px',
                right: '25%',
                top: '60%',
                transform: 'rotate(30deg)',
              }}
            />
            <StartTextRow>
              <StyledSeerWaitingIcon size="lg" />
              <Fragment>Need help digging deeper?</Fragment>
            </StartTextRow>
          </AutofixStartText>
          <InputWrapper onSubmit={handleSubmit}>
            <StyledInput
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="(Optional) Share helpful context here..."
              maxLength={4096}
            />
            <StyledButton
              type="submit"
              priority="primary"
              analyticsEventKey={
                message
                  ? 'autofix.give_instructions_clicked'
                  : 'autofix.start_fix_clicked'
              }
              analyticsEventName={
                message
                  ? 'Autofix: Give Instructions Clicked'
                  : 'Autofix: Start Fix Clicked'
              }
              analyticsParams={{group_id: groupId}}
            >
              {t('Start Autofix')}
            </StyledButton>
          </InputWrapper>
        </Container>
      </ScaleContainer>
    </Wrapper>
  );
}

interface SeerDrawerProps {
  event: Event;
  group: Group;
  project: Project;
}

const AiSetupDataConsent = HookOrDefault({
  hookName: 'component:ai-setup-data-consent',
  defaultComponent: () => <div data-test-id="ai-setup-data-consent" />,
});

export function SeerDrawer({group, project, event}: SeerDrawerProps) {
  const organization = useOrganization();
  const {autofixData, triggerAutofix, reset} = useAiAutofix(group, event);
  const aiConfig = useAiConfig(group, project);

  useRouteAnalyticsParams({autofix_status: autofixData?.status ?? 'none'});

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    // Detect scroll direction
    const scrollingUp = container.scrollTop < lastScrollTopRef.current;
    lastScrollTopRef.current = container.scrollTop;

    // Check if we're at the bottom
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 1;

    // Disable auto-scroll if scrolling up
    if (scrollingUp) {
      userScrolledRef.current = true;
    }

    // Re-enable auto-scroll if we reach the bottom
    if (isAtBottom) {
      userScrolledRef.current = false;
    }
  };

  useEffect(() => {
    // Only auto-scroll if user hasn't manually scrolled
    if (!userScrolledRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [autofixData]);

  return (
    <SeerDrawerContainer className="seer-drawer-container">
      <SeerDrawerHeader>
        <NavigationCrumbs
          crumbs={[
            {
              label: (
                <CrumbContainer>
                  <ProjectAvatar project={project} />
                  <ShortId>{group.shortId}</ShortId>
                </CrumbContainer>
              ),
            },
            {label: getShortEventId(event.id)},
            {label: t('Seer')},
          ]}
        />
      </SeerDrawerHeader>
      <SeerDrawerNavigator>
        <Header>
          {t('Autofix')}
          <StyledFeatureBadge
            type="beta"
            tooltipProps={{
              title: tct(
                'This feature is in beta. Try it out and let us know your feedback at [email:autofix@sentry.io].',
                {email: <a href="mailto:autofix@sentry.io" />}
              ),
              isHoverable: true,
            }}
          />
          <QuestionTooltip
            isHoverable
            title={
              <Flex column gap={space(1)}>
                <div>
                  {tct(
                    'Seer models are powered by generative Al. Per our [dataDocs:data usage policies], Sentry does not use your data to train Seer models or share your data with other customers without your express consent.',
                    {
                      dataDocs: (
                        <ExternalLink href="https://docs.sentry.io/product/issues/issue-details/sentry-ai/#data-processing" />
                      ),
                    }
                  )}
                </div>
                <div>
                  {tct('Seer can be turned off in [settingsDocs:Settings].', {
                    settingsDocs: (
                      <Link
                        to={`/settings/${organization.slug}/general-settings/#hideAiFeatures`}
                      />
                    ),
                  })}
                </div>
              </Flex>
            }
            size="sm"
          />
        </Header>
        {!aiConfig.needsGenAIConsent && (
          <ButtonBarWrapper data-test-id="autofix-button-bar">
            <ButtonBar gap={1}>
              <Feature features={['organizations:autofix-seer-preferences']}>
                <AutofixPreferenceDropdown project={project} />
              </Feature>
              <AutofixFeedback />
              {aiConfig.hasAutofix && (
                <Button
                  size="xs"
                  onClick={reset}
                  title={
                    autofixData?.created_at
                      ? `Last run at ${autofixData.created_at.split('T')[0]}`
                      : null
                  }
                  disabled={!autofixData}
                >
                  {t('Start Over')}
                </Button>
              )}
            </ButtonBar>
          </ButtonBarWrapper>
        )}
      </SeerDrawerNavigator>

      {!aiConfig.isAutofixSetupLoading && !aiConfig.needsGenAIConsent && autofixData && (
        <AutofixProgressBar autofixData={autofixData} />
      )}
      <SeerDrawerBody ref={scrollContainerRef} onScroll={handleScroll}>
        {aiConfig.isAutofixSetupLoading ? (
          <div data-test-id="ai-setup-loading-indicator">
            <LoadingIndicator />
          </div>
        ) : aiConfig.needsGenAIConsent ? (
          <AiSetupDataConsent groupId={group.id} />
        ) : (
          <Fragment>
            <SeerNotices
              groupId={group.id}
              hasGithubIntegration={aiConfig.hasGithubIntegration}
              project={project}
            />
            {aiConfig.hasSummary && (
              <StyledCard>
                <GroupSummary group={group} event={event} project={project} />
              </StyledCard>
            )}
            {aiConfig.hasAutofix && (
              <Fragment>
                {autofixData ? (
                  <AutofixSteps
                    data={autofixData}
                    groupId={group.id}
                    runId={autofixData.run_id}
                  />
                ) : (
                  <AutofixStartBox onSend={triggerAutofix} groupId={group.id} />
                )}
              </Fragment>
            )}
          </Fragment>
        )}
      </SeerDrawerBody>
    </SeerDrawerContainer>
  );
}

export const useOpenSeerDrawer = (
  group: Group,
  project: Project,
  event: Event | undefined,
  buttonRef?: React.RefObject<HTMLButtonElement | null>
) => {
  const {openDrawer} = useDrawer();

  return useCallback(() => {
    if (!event) {
      return;
    }

    openDrawer(() => <SeerDrawer group={group} project={project} event={event} />, {
      ariaLabel: t('Seer drawer'),
      drawerKey: 'seer-autofix-drawer',
      drawerCss: css`
        height: fit-content;
        max-height: 100%;
      `,
      shouldCloseOnInteractOutside: element => {
        const viewAllButton = buttonRef?.current;

        // Check if the element is inside any autofix input element
        const isInsideAutofixInput = () => {
          const rethinkInputs = document.querySelectorAll(
            '[data-autofix-input-type="rethink"]'
          );
          const agentCommentInputs = document.querySelectorAll(
            '[data-autofix-input-type="agent-comment"]'
          );

          // Check if element is inside any rethink input
          for (const input of rethinkInputs) {
            if (input.contains(element)) {
              return true;
            }
          }

          // Check if element is inside any agent comment input
          for (const input of agentCommentInputs) {
            if (input.contains(element)) {
              return true;
            }
          }

          return false;
        };

        if (
          viewAllButton?.contains(element) ||
          document.getElementById('sentry-feedback')?.contains(element) ||
          isInsideAutofixInput() ||
          document.getElementById('autofix-output-stream')?.contains(element) ||
          document.getElementById('autofix-write-access-modal')?.contains(element) ||
          element.closest('[data-overlay="true"]')
        ) {
          return false;
        }
        return true;
      },
    });
  }, [openDrawer, buttonRef, event, group, project]);
};

const Wrapper = styled('div')`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: ${space(1)} ${space(4)};
  gap: ${space(1)};
`;

const ScaleContainer = styled('div')`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${space(1)};
`;

const Container = styled('div')`
  position: relative;
  width: 100%;
  border-radius: ${p => p.theme.borderRadius};
  background: ${p => p.theme.background}
    linear-gradient(135deg, ${p => p.theme.pink400}08, ${p => p.theme.pink400}20);
  overflow: hidden;
  padding: ${space(0.5)};
  border: 1px solid ${p => p.theme.border};
`;

const AutofixStartText = styled('div')`
  margin: 0;
  padding: ${space(1)};
  white-space: pre-wrap;
  word-break: break-word;
  font-size: ${p => p.theme.fontSizeLarge};
  position: relative;
`;

const StartTextRow = styled('div')`
  display: flex;
  align-items: center;
  gap: ${space(1)};
`;

const StyledSeerWaitingIcon = styled(SeerWaitingIcon)`
  color: ${p => p.theme.textColor};
`;

const BackgroundStar = styled('img')`
  position: absolute;
  filter: sepia(1) saturate(3) hue-rotate(290deg);
  opacity: 0.7;
  pointer-events: none;
  z-index: 0;
`;

const StyledArrow = styled(IconArrow)`
  color: ${p => p.theme.subText};
  opacity: 0.5;
`;

const InputWrapper = styled('form')`
  display: flex;
  gap: ${space(0.5)};
  padding: ${space(0.25)} ${space(0.25)};
`;

const StyledInput = styled(Input)`
  flex-grow: 1;
  background: ${p => p.theme.background};
  border-color: ${p => p.theme.innerBorder};

  &:hover {
    border-color: ${p => p.theme.border};
  }
`;

const StyledButton = styled(Button)`
  flex-shrink: 0;
`;

const StyledCard = styled('div')`
  background: ${p => p.theme.backgroundElevated};
  overflow: visible;
  border: 1px solid ${p => p.theme.border};
  border-radius: ${p => p.theme.borderRadius};
  padding: ${space(2)} ${space(3)};
  box-shadow: ${p => p.theme.dropShadowMedium};
`;

const StyledFeatureBadge = styled(FeatureBadge)`
  margin-left: ${space(0.25)};
  padding-bottom: 3px;
`;

const SeerDrawerContainer = styled('div')`
  height: 100%;
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  position: relative;
`;

const SeerDrawerHeader = styled(DrawerHeader)`
  position: unset;
  max-height: ${MIN_NAV_HEIGHT}px;
  box-shadow: none;
  border-bottom: 1px solid ${p => p.theme.border};
`;

const SeerDrawerNavigator = styled('div')`
  display: flex;
  align-items: center;
  padding: ${space(0.75)} ${space(3)};
  background: ${p => p.theme.background};
  z-index: 1;
  min-height: ${MIN_NAV_HEIGHT}px;
  box-shadow: ${p => p.theme.translucentBorder} 0 1px;
`;

const SeerDrawerBody = styled(DrawerBody)`
  overflow: auto;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
  /* Move the scrollbar to the left edge */
  scroll-margin: 0 ${space(2)};
  direction: rtl;
  * {
    direction: ltr;
  }
`;

const Header = styled('h3')`
  font-size: ${p => p.theme.fontSizeExtraLarge};
  font-weight: ${p => p.theme.fontWeightBold};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${space(1)};
`;

const NavigationCrumbs = styled(NavigationBreadcrumbs)`
  margin: 0;
  padding: 0;
`;

const CrumbContainer = styled('div')`
  display: flex;
  gap: ${space(1)};
  align-items: center;
`;

const ShortId = styled('div')`
  font-family: ${p => p.theme.text.family};
  font-size: ${p => p.theme.fontSizeMedium};
  line-height: 1;
`;

const ButtonBarWrapper = styled('div')`
  margin-left: auto;
`;
