'use client';

import { UploadOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Flex, Form, Input, Modal, Select, Switch, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { type PersonRole, roleOptions, roleSupportsSeniority, seniorityOptions, type Seniority } from '../shared/people';

export type PersonFormModalValues = {
  name: string;
  email: string;
  role: PersonRole;
  seniority: Seniority;
  jiraUserKey?: string;
  gitUsername?: string;
  avatarUrl?: string;
  active: boolean;
};

type PersonFormModalProps = {
  open: boolean;
  editing: boolean;
  form: FormInstance<PersonFormModalValues>;
  currentAvatarUrl: string;
  maxAvatarSizeMb: number;
  confirmLoading: boolean;
  isMobile: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  onFinish: (values: PersonFormModalValues) => void;
  onAvatarSelect: NonNullable<UploadProps['beforeUpload']>;
  onClearAvatar: () => void;
};

export function PersonFormModal({
  open,
  editing,
  form,
  currentAvatarUrl,
  maxAvatarSizeMb,
  confirmLoading,
  isMobile,
  onCancel,
  onSubmit,
  onFinish,
  onAvatarSelect,
  onClearAvatar
}: PersonFormModalProps) {
  const selectedRole = Form.useWatch('role', form);

  return (
    <Modal
      title={editing ? 'Editar pessoa' : 'Adicionar pessoa'}
      open={open}
      onCancel={onCancel}
      onOk={onSubmit}
      okText={editing ? 'Salvar' : 'Cadastrar'}
      cancelText="Cancelar"
      confirmLoading={confirmLoading}
      destroyOnHidden
      width={isMobile ? 'calc(100vw - 24px)' : 560}
      centered={!isMobile}
      style={isMobile ? { top: 12 } : undefined}
    >
      <Form<PersonFormModalValues> form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="avatarUrl" hidden>
          <Input />
        </Form.Item>

        <Form.Item label="Foto">
          <Flex align="center" gap={12} wrap>
            <Avatar
              size={72}
              src={currentAvatarUrl || undefined}
              icon={<UserOutlined />}
              style={{ flexShrink: 0 }}
            />

            <Flex gap={8} wrap>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={onAvatarSelect}
              >
                <Button icon={<UploadOutlined />}>Enviar foto</Button>
              </Upload>

              <Button htmlType="button" onClick={onClearAvatar} disabled={!currentAvatarUrl}>
                Remover foto
              </Button>
            </Flex>
          </Flex>

          <Typography.Text type="secondary">PNG/JPG até {maxAvatarSizeMb}MB.</Typography.Text>
        </Form.Item>

        <Form.Item label="Nome" name="name" rules={[{ required: true, message: 'Informe um nome' }]}>
          <Input placeholder="Nome completo" size="large" />
        </Form.Item>

        <Form.Item
          label="E-mail"
          name="email"
          rules={[
            { required: true, message: 'Informe um e-mail' },
            { type: 'email', message: 'E-mail inválido' }
          ]}
        >
          <Input placeholder="pessoa@empresa.com" size="large" />
        </Form.Item>

        <Form.Item
          label="Vínculo Jira"
          name="jiraUserKey"
          extra="Aceita accountId ou URL de perfil do Jira. O sistema valida e normaliza ao salvar."
        >
          <Input placeholder="ed44d5f9-22cb-411b-871d-92f63354eac9" size="large" />
        </Form.Item>

        <Form.Item label="Usuário Git" name="gitUsername" extra="Ex.: login no GitHub/GitLab">
          <Input placeholder="gitusername" size="large" />
        </Form.Item>

        <Form.Item label="Cargo" name="role" rules={[{ required: true, message: 'Selecione um cargo' }]}>
          <Select options={roleOptions} size="large" />
        </Form.Item>

        {selectedRole && roleSupportsSeniority(selectedRole) ? (
          <Form.Item
            label="Nível"
            name="seniority"
            rules={[{ required: true, message: 'Selecione um nível' }]}
          >
            <Select options={seniorityOptions} size="large" />
          </Form.Item>
        ) : null}

        <Form.Item label="Status" name="active" valuePropName="checked">
          <Switch checkedChildren="Ativo" unCheckedChildren="Inativo" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
