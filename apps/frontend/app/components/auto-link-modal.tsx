'use client';

import { Form, Input, Modal, Typography } from 'antd';
import type { FormInstance } from 'antd/es/form';

export type AutoLinkFormValues = {
  githubOrgUrl: string;
};

type AutoLinkModalProps = {
  open: boolean;
  loading: boolean;
  isMobile: boolean;
  defaultGithubOrg: string;
  form: FormInstance<AutoLinkFormValues>;
  onCancel: () => void;
  onSubmit: () => void;
  onFinish: (values: AutoLinkFormValues) => void;
};

export function AutoLinkModal({
  open,
  loading,
  isMobile,
  defaultGithubOrg,
  form,
  onCancel,
  onSubmit,
  onFinish
}: AutoLinkModalProps) {
  return (
    <Modal
      title="Vinculação automática"
      open={open}
      onCancel={onCancel}
      onOk={onSubmit}
      okText="Executar vínculo"
      cancelText="Cancelar"
      confirmLoading={loading}
      destroyOnHidden
      width={isMobile ? 'calc(100vw - 24px)' : 560}
      centered={!isMobile}
      style={isMobile ? { top: 12 } : undefined}
    >
      <Form<AutoLinkFormValues> form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          label="Link da organização GitHub"
          name="githubOrgUrl"
          extra="Ex.: https://github.com/sua-org ou apenas sua-org"
          rules={[{ required: true, message: 'Informe o link da organização GitHub' }]}
        >
          <Input placeholder={`https://github.com/${defaultGithubOrg}`} size="large" />
        </Form.Item>

        <Typography.Text type="secondary">
          O sistema vai tentar vincular Jira e GitHub por e-mail, e puxar foto do Jira quando faltar.
        </Typography.Text>
      </Form>
    </Modal>
  );
}
